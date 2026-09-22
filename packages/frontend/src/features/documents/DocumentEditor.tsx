import {
    ChartType,
    type Document,
    type DocumentCell,
    type SemanticChartAsCode,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconPlus,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router';
import Callout from '../../components/common/Callout';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import DocumentChart from './DocumentChart';
import DocumentDraftChart from './DocumentDraftChart';
import { getDocumentHeadings } from './documentHeadings';
import DocumentMarkdownEditor from './DocumentMarkdownEditor';
import DocumentPageLayout from './DocumentPageLayout';
import DocumentReportLayout from './presentation/DocumentReportLayout';
import { useUpdateDocumentContent } from './useUpdateDocumentContent';

const DocumentChartEditorModal = lazy(
    () => import('./DocumentChartEditorModal'),
);

type DraftCell = {
    key: number;
    sourceIndex: number | null;
    cell: DocumentCell;
};

const DocumentEditor = ({
    document,
    onClose,
}: {
    document: Document;
    onClose: () => void;
}) => {
    const [draft, setDraft] = useState<DraftCell[]>(() =>
        document.version.content.cells.map((cell, index) => ({
            key: index,
            sourceIndex: index,
            cell,
        })),
    );
    const nextKey = useRef(draft.length);
    const [chartEditor, setChartEditor] = useState<{
        key: number | null;
        chart: SemanticChartAsCode | null;
    } | null>(null);
    const { canDrillInto: canAuthorCharts } = useContextMenuPermissions({
        projectUuid: document.projectUuid,
        organizationUuid: document.organizationUuid,
    });
    const [confirmCancel, setConfirmCancel] = useState(false);
    const update = useUpdateDocumentContent(
        document.projectUuid,
        document.documentUuid,
    );
    const cells = draft.map(({ cell }) => cell);
    const headings = getDocumentHeadings(cells);
    const dirty =
        JSON.stringify(cells) !==
        JSON.stringify(document.version.content.cells);
    const blocker = useBlocker(
        dirty || update.isLoading || chartEditor !== null,
    );
    useBeforeUnload((event) => {
        if (dirty || update.isLoading || chartEditor !== null) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
    const move = (index: number, direction: number) => {
        setDraft((previous) => {
            const reordered = [...previous];
            const [cell] = reordered.splice(index, 1);
            reordered.splice(index + direction, 0, cell);
            return reordered;
        });
    };
    const save = () =>
        update.mutate(
            {
                baseVersionUuid: document.version.versionUuid,
                content: { cells },
            },
            { onSuccess: onClose },
        );
    return (
        <DocumentPageLayout
            name={document.name}
            actions={
                <Group gap="sm">
                    <Button
                        variant="default"
                        disabled={update.isLoading}
                        onClick={() =>
                            dirty ? setConfirmCancel(true) : onClose()
                        }
                    >
                        Cancel
                    </Button>
                    <Button
                        loading={update.isLoading}
                        disabled={!dirty}
                        onClick={save}
                    >
                        Save document
                    </Button>
                </Group>
            }
        >
            <DocumentReportLayout
                title={document.name}
                contentsLabel={null}
                headings={headings}
            >
                <Stack gap="lg">
                    {update.error && (
                        <Callout variant="danger">
                            {update.error.error.statusCode === 409
                                ? 'This document changed while you were editing. Your changes have not been saved. Copy any text you want to keep, then cancel and reopen the editor to load the latest version.'
                                : update.error.error.message}
                        </Callout>
                    )}
                    {draft.map(({ key, cell, sourceIndex }, index) => {
                        const renderHeader = (modeSwitch?: ReactNode) => (
                            <Group justify="space-between">
                                <Text size="sm" fw={500}>
                                    {cell.type === 'markdown'
                                        ? 'Text'
                                        : cell.content.chart.name}
                                </Text>
                                <Group gap="xs">
                                    {modeSwitch}
                                    {cell.type === 'chart' &&
                                        canAuthorCharts && (
                                            <Tooltip
                                                label={
                                                    cell.content.source ===
                                                    'merge'
                                                        ? 'Merge charts are read-only'
                                                        : 'Edit chart'
                                                }
                                            >
                                                <ActionIcon
                                                    aria-label={`Edit chart ${index + 1}`}
                                                    disabled={
                                                        update.isLoading ||
                                                        cell.content.source !==
                                                            'semantic' ||
                                                        cell.content.chart
                                                            .chartConfig
                                                            .type ===
                                                            ChartType.DATA_APP_VIZ
                                                    }
                                                    onClick={() => {
                                                        if (
                                                            cell.content
                                                                .source ===
                                                            'semantic'
                                                        ) {
                                                            setChartEditor({
                                                                key,
                                                                chart: cell
                                                                    .content
                                                                    .chart,
                                                            });
                                                        }
                                                    }}
                                                >
                                                    <MantineIcon
                                                        icon={IconPencil}
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    <Tooltip label="Move up">
                                        <ActionIcon
                                            aria-label={`Move section ${index + 1} up`}
                                            disabled={
                                                index === 0 || update.isLoading
                                            }
                                            onClick={() => move(index, -1)}
                                        >
                                            <MantineIcon icon={IconArrowUp} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="Move down">
                                        <ActionIcon
                                            aria-label={`Move section ${index + 1} down`}
                                            disabled={
                                                index === draft.length - 1 ||
                                                update.isLoading
                                            }
                                            onClick={() => move(index, 1)}
                                        >
                                            <MantineIcon icon={IconArrowDown} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <ConfirmDeleteButton
                                        aria-label={`Remove section ${index + 1}`}
                                        tooltip="Click again to remove section"
                                        disabled={update.isLoading}
                                        onConfirm={() =>
                                            setDraft((previous) =>
                                                previous.filter(
                                                    (item) => item.key !== key,
                                                ),
                                            )
                                        }
                                    >
                                        <MantineIcon icon={IconTrash} />
                                    </ConfirmDeleteButton>
                                </Group>
                            </Group>
                        );
                        return (
                            <Paper key={key} p="md">
                                <Stack gap="sm">
                                    {cell.type === 'chart' && renderHeader()}
                                    {cell.type === 'markdown' ? (
                                        <DocumentMarkdownEditor
                                            renderHeader={renderHeader}
                                            headings={headings.filter(
                                                (heading) =>
                                                    heading.id.startsWith(
                                                        `document-heading-${index}-`,
                                                    ),
                                            )}
                                            markdown={cell.content.markdown}
                                            disabled={update.isLoading}
                                            onChange={(markdown) =>
                                                setDraft((previous) =>
                                                    previous.map((item) =>
                                                        item.key === key
                                                            ? {
                                                                  ...item,
                                                                  cell: {
                                                                      type: 'markdown',
                                                                      content: {
                                                                          markdown,
                                                                      },
                                                                  },
                                                              }
                                                            : item,
                                                    ),
                                                )
                                            }
                                        />
                                    ) : sourceIndex !== null ? (
                                        <DocumentChart
                                            projectUuid={document.projectUuid}
                                            spaceUuid={document.spaceUuid}
                                            documentUuid={document.documentUuid}
                                            versionUuid={
                                                document.version.versionUuid
                                            }
                                            cellIndex={sourceIndex}
                                            cell={cell}
                                        />
                                    ) : cell.content.source === 'semantic' ? (
                                        // Applying a chart edit remounts the preview so the
                                        // visualization drops state it seeded from the old chart
                                        <DocumentDraftChart
                                            key={JSON.stringify(
                                                cell.content.chart,
                                            )}
                                            projectUuid={document.projectUuid}
                                            spaceUuid={document.spaceUuid}
                                            chart={cell.content.chart}
                                        />
                                    ) : null}
                                </Stack>
                            </Paper>
                        );
                    })}
                    <Button
                        variant="default"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        disabled={update.isLoading}
                        onClick={() => {
                            const key = nextKey.current++;
                            setDraft((previous) => [
                                ...previous,
                                {
                                    key,
                                    sourceIndex: null,
                                    cell: {
                                        type: 'markdown',
                                        content: { markdown: '' },
                                    },
                                },
                            ]);
                        }}
                    >
                        Add text
                    </Button>
                    {canAuthorCharts && (
                        <Button
                            variant="default"
                            disabled={update.isLoading}
                            onClick={() =>
                                setChartEditor({ key: null, chart: null })
                            }
                        >
                            Add chart
                        </Button>
                    )}
                </Stack>
            </DocumentReportLayout>
            {chartEditor && canAuthorCharts && (
                <Suspense
                    fallback={<EmptyStateLoader title="Loading chart editor" />}
                >
                    <DocumentChartEditorModal
                        chart={chartEditor.chart}
                        onClose={() => setChartEditor(null)}
                        onApply={(chart) => {
                            const cell: DocumentCell = {
                                type: 'chart',
                                content: { source: 'semantic', chart },
                            };
                            if (chartEditor.key === null) {
                                const key = nextKey.current++;
                                setDraft((previous) => [
                                    ...previous,
                                    { key, sourceIndex: null, cell },
                                ]);
                            } else {
                                setDraft((previous) =>
                                    previous.map((item) =>
                                        item.key === chartEditor.key
                                            ? {
                                                  ...item,
                                                  cell,
                                                  sourceIndex: null,
                                              }
                                            : item,
                                    ),
                                );
                            }
                            setChartEditor(null);
                        }}
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
                            disabled={update.isLoading}
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
