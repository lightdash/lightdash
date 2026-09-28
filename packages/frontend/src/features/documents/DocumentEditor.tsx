import { type Document, type SemanticChartAsCode } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Stack,
    Text,
    Textarea,
    Tooltip,
} from '@mantine/core';
import { IconChartBar, IconCheck, IconDots, IconX } from '@tabler/icons-react';
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
import DocumentByline from './DocumentByline';
import DocumentPageLayout from './DocumentPageLayout';
import { getDocumentCells } from './editor/documentCells';
import {
    DOCUMENT_CHART_NODE,
    isEditableChart,
    type DocumentChartAttributes,
} from './editor/documentChartNode';
import { DocumentEditorProvider } from './editor/DocumentEditorContext';
import { useDocumentEditor } from './editor/useDocumentEditor';
import { useTopGapClick } from './editor/useTopGapClick';
import DocumentReportLayout from './presentation/DocumentReportLayout';
import styles from './presentation/ReportPresentation.module.css';
import { useUpdateDocumentContent } from './useUpdateDocumentContent';
import { useUpdateDocumentMetadata } from './useUpdateDocumentMetadata';

const DocumentChartEditorModal = lazy(
    () => import('./DocumentChartEditorModal'),
);

/** Where a chart edit lands: an existing node's position, or an insertion point. */
type ChartEditorState =
    | { mode: 'insert'; position: number | null }
    | { mode: 'edit'; position: number; chart: SemanticChartAsCode };

const DocumentEditor = ({
    document,
    onClose,
    initialScrollTop,
    onScrollTopChange,
}: {
    document: Document;
    onClose: () => void;
    initialScrollTop?: number;
    onScrollTopChange?: (scrollTop: number) => void;
}) => {
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
        (position: number) => setChartEditor({ mode: 'insert', position }),
        [],
    );
    const {
        editor,
        headings,
        dirty: contentDirty,
    } = useDocumentEditor(document, {
        onInsertChart: canAuthorCharts ? onInsertChart : null,
        onEditChart: canAuthorCharts
            ? (position, content) => {
                  if (
                      content.source === 'semantic' &&
                      isEditableChart(content)
                  ) {
                      setChartEditor({
                          mode: 'edit',
                          position,
                          chart: content.chart,
                      });
                  }
              }
            : null,
    });
    useTopGapClick(editor);
    // The Edit button unmounts on entry, so place focus deliberately: an
    // empty document is ready to type into, otherwise Cancel takes Edit's spot
    const cancelRef = useRef<HTMLButtonElement>(null);
    const startsEmpty = document.version.content.cells.length === 0;
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
    const blocker = useBlocker(blockNavigation);
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
                    content: { cells: getDocumentCells(editor) },
                });
            }
            onClose();
        } catch {
            // The failed mutation's error is shown above the body
        }
    };

    const applyChart = (chart: SemanticChartAsCode) => {
        if (!editor || !chartEditor) {
            return;
        }
        const attrs: DocumentChartAttributes = {
            content: { source: 'semantic', chart },
            sourceIndex: null,
        };
        if (chartEditor.mode === 'edit') {
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
                    chartEditor.position ?? editor.state.selection.to,
                    { type: DOCUMENT_CHART_NODE, attrs },
                )
                .run();
        }
        setChartEditor(null);
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
                                    onClick={() =>
                                        setChartEditor({
                                            mode: 'insert',
                                            position: null,
                                        })
                                    }
                                >
                                    <MantineIcon icon={IconChartBar} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        <Tooltip label="Save document">
                            <ActionIcon
                                variant="default"
                                size="lg"
                                className={styles.quietDisabled}
                                aria-label="Save document"
                                loading={busy}
                                disabled={!dirty || !nameValid}
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
                        />
                    </DocumentEditorProvider>
                </Stack>
            </DocumentReportLayout>
            {chartEditor && canAuthorCharts && (
                <Suspense
                    fallback={<EmptyStateLoader title="Loading chart editor" />}
                >
                    <DocumentChartEditorModal
                        chart={
                            chartEditor.mode === 'edit'
                                ? chartEditor.chart
                                : null
                        }
                        onClose={() => {
                            setChartEditor(null);
                            // The modal unmounts without returning focus
                            editor?.commands.focus();
                        }}
                        onApply={applyChart}
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
