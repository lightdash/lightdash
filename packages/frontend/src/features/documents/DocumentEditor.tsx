import { type Document, type SemanticChartAsCode } from '@lightdash/common';
import { Button, Group, Stack, Text } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { EditorContent } from '@tiptap/react';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
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
import DocumentReportLayout from './presentation/DocumentReportLayout';
import styles from './presentation/ReportPresentation.module.css';
import { useUpdateDocumentContent } from './useUpdateDocumentContent';

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
}: {
    document: Document;
    onClose: () => void;
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
    const onInsertChart = useCallback(
        (position: number) => setChartEditor({ mode: 'insert', position }),
        [],
    );
    const { editor, headings, dirty } = useDocumentEditor(document, {
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
    const busy = update.isLoading;
    const blockNavigation = dirty || busy || chartEditor !== null;
    const blocker = useBlocker(blockNavigation);
    useBeforeUnload((event) => {
        if (blockNavigation) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    const save = () => {
        if (!editor) {
            return;
        }
        update.mutate(
            {
                baseVersionUuid: document.version.versionUuid,
                content: { cells: getDocumentCells(editor) },
            },
            { onSuccess: onClose },
        );
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
        <DocumentPageLayout
            name={document.name}
            actions={
                <Group gap="sm">
                    {canAuthorCharts && (
                        <Button
                            variant="default"
                            leftSection={<MantineIcon icon={IconChartBar} />}
                            disabled={busy}
                            onClick={() =>
                                setChartEditor({
                                    mode: 'insert',
                                    position: null,
                                })
                            }
                        >
                            Add chart
                        </Button>
                    )}
                    <Button
                        variant="default"
                        disabled={busy}
                        onClick={() =>
                            dirty ? setConfirmCancel(true) : onClose()
                        }
                    >
                        Cancel
                    </Button>
                    <Button loading={busy} disabled={!dirty} onClick={save}>
                        Save document
                    </Button>
                </Group>
            }
        >
            <DocumentReportLayout
                title={document.name}
                contentsLabel={null}
                headings={headings}
                variant="document"
                metadata={<DocumentByline document={document} />}
            >
                <Stack gap="lg">
                    {update.error && (
                        <Callout variant="danger">
                            {update.error.error.statusCode === 409
                                ? 'This document changed while you were editing. Your changes have not been saved. Copy any text you want to keep, then cancel and reopen the editor to load the latest version.'
                                : update.error.error.message}
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
                        onClose={() => setChartEditor(null)}
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
