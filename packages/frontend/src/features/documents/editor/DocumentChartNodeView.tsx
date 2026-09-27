import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import MantineIcon from '../../../components/common/MantineIcon';
import ErrorBoundary from '../../errorBoundary/ErrorBoundary';
import DocumentChart from '../DocumentChart';
import DocumentDraftChart from '../DocumentDraftChart';
import ReportChartFrame from '../presentation/ReportChartFrame';
import {
    isEditableChart,
    type DocumentChartAttributes,
    type DocumentChartNodeOptions,
} from './documentChartNode';
import { useDocumentEditorTarget } from './DocumentEditorContext';

const DocumentChartNodeView = ({
    node,
    editor,
    extension,
    getPos,
    deleteNode,
    selected,
}: NodeViewProps) => {
    const { content, sourceIndex } = node.attrs as DocumentChartAttributes;
    const { onEditChart } = extension.options as DocumentChartNodeOptions;
    const target = useDocumentEditorTarget();
    if (!content) {
        return null;
    }
    const editing = editor.isEditable;
    const actions = editing ? (
        <Group gap="xs" wrap="nowrap">
            {onEditChart && (
                <Tooltip
                    label={
                        isEditableChart(content)
                            ? 'Edit chart'
                            : 'This chart type is read-only'
                    }
                >
                    <ActionIcon
                        aria-label={`Edit chart ${content.chart.name}`}
                        disabled={!isEditableChart(content)}
                        onClick={() => {
                            const position = getPos();
                            if (position !== undefined) {
                                onEditChart(position, content);
                            }
                        }}
                    >
                        <MantineIcon icon={IconPencil} />
                    </ActionIcon>
                </Tooltip>
            )}
            <Tooltip label="Remove chart">
                <ActionIcon
                    aria-label={`Remove chart ${content.chart.name}`}
                    onClick={deleteNode}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Tooltip>
        </Group>
    ) : undefined;
    return (
        <NodeViewWrapper data-selected={selected || undefined}>
            <ErrorBoundary
                fallbackWrapper={(fallback) => (
                    <ReportChartFrame
                        title={content.chart.name}
                        actions={actions}
                    >
                        {fallback}
                    </ReportChartFrame>
                )}
            >
                {sourceIndex === null ? (
                    content.source === 'semantic' ? (
                        <DocumentDraftChart
                            projectUuid={target.projectUuid}
                            spaceUuid={target.spaceUuid}
                            chart={content.chart}
                            actions={actions}
                        />
                    ) : null
                ) : (
                    <DocumentChart
                        showTitle
                        projectUuid={target.projectUuid}
                        spaceUuid={target.spaceUuid}
                        documentUuid={target.documentUuid}
                        versionUuid={target.versionUuid}
                        cellIndex={sourceIndex}
                        cell={{ type: 'chart', content }}
                        actions={actions}
                    />
                )}
            </ErrorBoundary>
        </NodeViewWrapper>
    );
};

export default DocumentChartNodeView;
