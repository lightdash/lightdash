import {
    ChartType,
    type Document,
    type DocumentSavedChartKind,
    type SemanticChartAsCode,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Stack,
    Text,
    Textarea,
    Tooltip,
} from '@mantine/core';
import {
    IconChartBar,
    IconCheck,
    IconDots,
    IconLink,
    IconX,
} from '@tabler/icons-react';
import { EditorContent } from '@tiptap/react';
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useBeforeUnload, useBlocker } from 'react-router';
import Callout from '../../components/common/Callout';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { isWalkthroughLeavingCopy } from '../scopeTours/trainingCopy';
import DocumentByline from './DocumentByline';
import DocumentPageLayout from './DocumentPageLayout';
import {
    DOCUMENT_CHART_NODE,
    isEditableChart,
    type DocumentChartAttributes,
} from './editor/documentChartNode';
import { DocumentEditorProvider } from './editor/DocumentEditorContext';
import {
    DOCUMENT_SAVED_CHART_NODE,
    type DocumentSavedChartAttributes,
} from './editor/documentSavedChartNode';
import {
    getDocumentContent,
    getTopLevelInsertPosition,
} from './editor/documentSerialization';
import { useDocumentEditor } from './editor/useDocumentEditor';
import { useTopDropZone } from './editor/useTopDropZone';
import { useTopGapClick } from './editor/useTopGapClick';
import DocumentReportLayout from './presentation/DocumentReportLayout';
import styles from './presentation/ReportPresentation.module.css';
import { useUpdateDocumentContent } from './useUpdateDocumentContent';
import { useUpdateDocumentMetadata } from './useUpdateDocumentMetadata';

const DocumentChartEditorModal = lazy(
    () => import('./DocumentChartEditorModal'),
);
const DocumentSavedChartPickerModal = lazy(
    () => import('./DocumentSavedChartPickerModal'),
);

/**
 * Where a chart edit lands: an existing node's position, or an insertion point.
 * An insert starts empty, or from a copy of a saved chart.
 */
type ChartEditorState =
    | { kind: 'saved'; position: number | null }
    | {
          kind: 'explore';
          mode: 'insert';
          position: number | null;
          chart: SemanticChartAsCode | null;
      }
    | {
          kind: 'explore';
          mode: 'edit';
          position: number;
          chart: SemanticChartAsCode;
      };

const DocumentEditor = ({
    document,
    newerVersionSaved,
    onClose,
    initialScrollTop,
    onScrollTopChange,
}: {
    document: Document;
    /** Someone, such as the AI agent, saved a newer version while this editor was open. */
    newerVersionSaved: boolean;
    onClose: () => void;
    initialScrollTop?: number;
    onScrollTopChange?: (scrollTop: number) => void;
}) => {
    const { track } = useTracking();
    const { canDrillInto: canAuthorCharts } = useContextMenuPermissions({
        projectUuid: document.projectUuid,
        organizationUuid: document.organizationUuid,
    });
    const [chartEditor, setChartEditor] = useState<ChartEditorState | null>(
        null,
    );
    const [confirmCancel, setConfirmCancel] = useState(false);
    const update = useUpdateDocumentContent(
        document.projectUuid,
        document.documentUuid,
    );
    const rename = useUpdateDocumentMetadata(
        document.projectUuid,
        document.documentUuid,
    );
    const [name, setName] = useState(document.name);
    const trimmedName = name.trim();
    const nameChanged = trimmedName !== document.name;
    const nameValid = trimmedName.length > 0 && trimmedName.length <= 255;
    const onInsertChart = useCallback(
        (position: number) =>
            setChartEditor({
                kind: 'explore',
                mode: 'insert',
                position,
                chart: null,
            }),
        [],
    );
    const onInsertSavedChart = useCallback(
        (position: number) => setChartEditor({ kind: 'saved', position }),
        [],
    );
    const {
        editor,
        headings,
        dirty: contentDirty,
    } = useDocumentEditor(document, {
        onInsertChart: canAuthorCharts ? onInsertChart : null,
        onInsertSavedChart,
        onEditChart: canAuthorCharts
            ? (position, content) => {
                  if (
                      content.source === 'semantic' &&
                      isEditableChart(content)
                  ) {
                      setChartEditor({
                          kind: 'explore',
                          mode: 'edit',
                          position,
                          chart: content.chart,
                      });
                  }
              }
            : null,
    });
    useTopGapClick(editor);
    useTopDropZone(editor);
    // The Edit button unmounts on entry, so place focus deliberately: an
    // empty document is ready to type into, otherwise Cancel takes Edit's spot
    const cancelRef = useRef<HTMLButtonElement>(null);
    const startsEmpty = document.version.content.markdown.trim() === '';
    useEffect(() => {
        if (!editor) {
            return undefined;
        }
        const placeFocus = () => {
            if (startsEmpty) {
                editor.commands.focus('start', { scrollIntoView: false });
            } else {
                cancelRef.current?.focus({ preventScroll: true });
            }
        };
        if (editor.isInitialized) {
            placeFocus();
            return undefined;
        }
        editor.once('create', placeFocus);
        return () => {
            editor.off('create', placeFocus);
        };
    }, [editor, startsEmpty]);
    const target = useMemo(
        () => ({
            projectUuid: document.projectUuid,
            spaceUuid: document.spaceUuid,
            documentUuid: document.documentUuid,
            versionUuid: document.version.versionUuid,
        }),
        [
            document.projectUuid,
            document.spaceUuid,
            document.documentUuid,
            document.version.versionUuid,
        ],
    );
    const busy = update.isLoading || rename.isLoading;
    const dirty = contentDirty || nameChanged;
    const saveError = rename.error ?? update.error;
    const blockNavigation = dirty || busy || chartEditor !== null;
    // A walkthrough leaving its training copy is let through: the copy, and
    // whatever was being edited in it, is removed a moment later anyway
    const blocker = useBlocker(
        (navigation) =>
            blockNavigation && !isWalkthroughLeavingCopy(navigation),
    );
    useBeforeUnload((event) => {
        if (blockNavigation) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    // Rename first: it keeps the version, so the content save below still
    // targets the version this editor loaded
    const save = async () => {
        if (!editor || !nameValid || busy) {
            return;
        }
        update.reset();
        rename.reset();
        try {
            if (nameChanged) {
                await rename.mutateAsync({ name: trimmedName });
            }
            if (contentDirty) {
                await update.mutateAsync({
                    baseVersionUuid: document.version.versionUuid,
                    content: getDocumentContent(editor),
                });
            }
            onClose();
        } catch {
            // The failed mutation's error is shown above the body
        }
    };

    const closeChartEditor = () => {
        setChartEditor(null);
        // The modal unmounts without returning focus
        editor?.commands.focus();
    };

    const applyChart = (chart: SemanticChartAsCode) => {
        if (!editor || !chartEditor || chartEditor.kind === 'saved') {
            return;
        }
        const content = { source: 'semantic' as const, chart };
        if (chartEditor.mode === 'edit') {
            const edited = editor.state.doc.nodeAt(chartEditor.position);
            const attrs: DocumentChartAttributes = {
                content,
                chartId:
                    (edited?.attrs as DocumentChartAttributes | undefined)
                        ?.chartId ?? null,
                isSaved: false,
            };
            editor
                .chain()
                .focus()
                .command(({ tr }) => {
                    tr.setNodeMarkup(chartEditor.position, undefined, attrs);
                    return true;
                })
                .run();
        } else {
            editor
                .chain()
                .focus()
                .insertContentAt(
                    getTopLevelInsertPosition(
                        editor.state.doc,
                        chartEditor.position ?? editor.state.selection.to,
                    ),
                    {
                        type: DOCUMENT_CHART_NODE,
                        attrs: {
                            content,
                            chartId: null,
                            isSaved: false,
                        } satisfies DocumentChartAttributes,
                    },
                )
                .run();
        }
        track({
            name: EventName.DOCUMENT_CHART_APPLIED,
            properties: {
                projectUuid: document.projectUuid,
                documentUuid: document.documentUuid,
                chartType: chart.chartConfig.type,
                isCustomChart:
                    chart.chartConfig.type === ChartType.DATA_APP_VIZ,
                mode: chartEditor.mode === 'edit' ? 'edit' : 'add',
            },
        });
        setChartEditor(null);
    };

    const linkSavedChart = (kind: DocumentSavedChartKind, uuid: string) => {
        if (!editor || chartEditor?.kind !== 'saved') {
            return;
        }
        editor
            .chain()
            .focus()
            .insertContentAt(
                getTopLevelInsertPosition(
                    editor.state.doc,
                    chartEditor.position ?? editor.state.selection.to,
                ),
                {
                    type: DOCUMENT_SAVED_CHART_NODE,
                    attrs: {
                        block: {
                            type: 'savedChart',
                            kind,
                            attributes: { uuid },
                        },
                    } satisfies DocumentSavedChartAttributes,
                },
            )
            .run();
        setChartEditor(null);
    };

    // A copy opens in its editor, so it can be changed before it's added
    const copySavedChart = (chart: SemanticChartAsCode) => {
        if (chartEditor?.kind !== 'saved') {
            return;
        }
        setChartEditor({
            kind: 'explore',
            mode: 'insert',
            position: chartEditor.position,
            chart,
        });
    };

    return (
        <DocumentPageLayout name={document.name}>
            <DocumentReportLayout
                title={
                    <Textarea
                        variant="unstyled"
                        autosize
                        minRows={1}
                        aria-label="Document name"
                        placeholder="Untitled document"
                        value={name}
                        disabled={busy}
                        error={nameValid ? undefined : true}
                        classNames={{ input: styles.titleInput }}
                        onChange={(event) =>
                            setName(
                                event.currentTarget.value.replace(/\n/g, ''),
                            )
                        }
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                editor?.commands.focus('start');
                            }
                        }}
                    />
                }
                contentsLabel={null}
                headings={headings}
                initialScrollTop={initialScrollTop}
                onScrollTopChange={onScrollTopChange}
                variant="document"
                actions={
                    <ActionIcon.Group
                        role="group"
                        aria-label="Editing controls"
                    >
                        <Tooltip label="Cancel editing">
                            <ActionIcon
                                ref={cancelRef}
                                variant="default"
                                size="lg"
                                aria-label="Cancel"
                                disabled={busy}
                                onClick={() =>
                                    dirty ? setConfirmCancel(true) : onClose()
                                }
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </Tooltip>
                        {canAuthorCharts && (
                            <Tooltip label="Add chart">
                                <ActionIcon
                                    variant="default"
                                    size="lg"
                                    aria-label="Add chart"
                                    disabled={busy}
                                    // Anchor for scope walkthroughs (data-tour-via)
                                    data-tour-anchor="document-add-chart"
                                    data-tour-hint="Click Add chart"
                                    onClick={() =>
                                        setChartEditor({
                                            kind: 'explore',
                                            mode: 'insert',
                                            position: null,
                                            chart: null,
                                        })
                                    }
                                >
                                    <MantineIcon icon={IconChartBar} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        <Tooltip label="Add saved chart">
                            <ActionIcon
                                variant="default"
                                size="lg"
                                aria-label="Add saved chart"
                                disabled={busy}
                                onClick={() =>
                                    setChartEditor({
                                        kind: 'saved',
                                        position: null,
                                    })
                                }
                            >
                                <MantineIcon icon={IconLink} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Save document">
                            <ActionIcon
                                variant="default"
                                size="lg"
                                className={styles.quietDisabled}
                                aria-label="Save document"
                                loading={busy}
                                disabled={!dirty || !nameValid}
                                // Walkthrough: write a document with a live
                                // chart. See scripts/scope-tours.
                                data-tour-scope="manage:Document"
                                data-tour-step="2"
                                data-tour-route="/projects/:projectUuid/documents/:documentUuidOrSlug"
                                data-tour-label="Save the document"
                                data-tour-title="Write a document with a live chart"
                                data-tour-interactive="true"
                                data-tour-via='[data-tour-nav="new"] >> [data-tour-nav="new-document"] >> [data-tour-anchor="document-name"] >> [data-tour-anchor="space-option"][data-tour-value="Shared"] >> [data-tour-anchor="document-create-submit"] >> [data-tour-anchor="document-body"] >> [data-tour-anchor="document-add-chart"] >> [data-tour-anchor="explore-table"][data-tour-value="Country orders"] >> [data-tour-anchor="explore-metric"][data-tour-value="Order Count"] >> [data-tour-anchor="explore-dimension"][data-tour-value="Country"] >> [data-tour-anchor="run-query"] >> [data-tour-anchor="document-chart-name"] >> [data-tour-anchor="document-chart-apply"]'
                                data-tour-docs="explore/documents.mdx#edit-a-document:p3:1"
                                onClick={() => {
                                    void save();
                                }}
                            >
                                <MantineIcon icon={IconCheck} />
                            </ActionIcon>
                        </Tooltip>
                        {/* Keeps the group the same width as in reading mode */}
                        <ActionIcon
                            variant="default"
                            size="lg"
                            className={styles.quietDisabled}
                            aria-label="Document actions are unavailable while editing"
                            disabled
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </ActionIcon.Group>
                }
                metadata={
                    <DocumentByline
                        document={document}
                        status={
                            <Badge
                                size="sm"
                                variant="filled"
                                color="blue"
                                role="status"
                            >
                                Editing
                            </Badge>
                        }
                    />
                }
            >
                <Stack gap="lg">
                    {newerVersionSaved && !saveError && (
                        <Callout variant="warning">
                            A newer version of this document was saved while you
                            were editing. Saving will fail, so copy any text you
                            want to keep, then cancel and reopen the editor to
                            load the latest version.
                        </Callout>
                    )}
                    {saveError && (
                        <Callout variant="danger">
                            {saveError.error.statusCode === 409
                                ? 'This document changed while you were editing. Your changes have not been saved. Copy any text you want to keep, then cancel and reopen the editor to load the latest version.'
                                : saveError.error.message}
                        </Callout>
                    )}
                    <DocumentEditorProvider value={target}>
                        <EditorContent
                            editor={editor}
                            className={styles.documentProse}
                            // Typed anchor for scope walkthroughs (data-tour-via)
                            data-tour-anchor="document-body"
                            data-tour-hint="Write the opening line"
                            data-tour-input="true"
                            data-tour-suggest="Where our orders come from, by country."
                        />
                    </DocumentEditorProvider>
                </Stack>
            </DocumentReportLayout>
            {chartEditor?.kind === 'explore' && canAuthorCharts && (
                <Suspense
                    fallback={<EmptyStateLoader title="Loading chart editor" />}
                >
                    <DocumentChartEditorModal
                        chart={chartEditor.chart}
                        isEditing={chartEditor.mode === 'edit'}
                        onClose={closeChartEditor}
                        onApply={applyChart}
                    />
                </Suspense>
            )}
            {chartEditor?.kind === 'saved' && (
                <Suspense
                    fallback={<EmptyStateLoader title="Loading saved charts" />}
                >
                    <DocumentSavedChartPickerModal
                        projectUuid={document.projectUuid}
                        canCopyChart={canAuthorCharts}
                        onClose={closeChartEditor}
                        onLink={linkSavedChart}
                        onCopy={copySavedChart}
                    />
                </Suspense>
            )}
            {(confirmCancel || blocker.state === 'blocked') && (
                <MantineModal
                    opened
                    title="Discard unsaved changes?"
                    onClose={() => {
                        setConfirmCancel(false);
                        if (blocker.state === 'blocked') {
                            blocker.reset();
                        }
                    }}
                    cancelLabel="Keep editing"
                    actions={
                        <Button
                            color="red"
                            disabled={busy}
                            onClick={() => {
                                if (blocker.state === 'blocked') {
                                    blocker.proceed();
                                } else {
                                    onClose();
                                }
                            }}
                        >
                            Discard changes
                        </Button>
                    }
                >
                    <Text>
                        Your changes to this Document have not been saved.
                    </Text>
                </MantineModal>
            )}
        </DocumentPageLayout>
    );
};

export default DocumentEditor;
