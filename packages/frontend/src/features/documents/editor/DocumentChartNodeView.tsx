import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { IconGripVertical, IconPencil, IconTrash } from '@tabler/icons-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { type KeyboardEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import ErrorBoundary from '../../errorBoundary/ErrorBoundary';
import DocumentChart from '../DocumentChart';
import DocumentDraftChart from '../DocumentDraftChart';
import ReportChartFrame from '../presentation/ReportChartFrame';
import styles from '../presentation/ReportPresentation.module.css';
import {
    isEditableChart,
    type DocumentChartAttributes,
    type DocumentChartNodeOptions,
} from './documentChartNode';
import { useDocumentEditorTarget } from './DocumentEditorContext';
import { moveTopLevelNode, type MoveDirection } from './moveTopLevelNode';

const MOVE_KEYS: Record<string, MoveDirection> = {
    ArrowUp: -1,
    ArrowDown: 1,
};

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
    const moveWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        const direction = MOVE_KEYS[event.key];
        const position = getPos();
        if (direction === undefined || position === undefined) {
            return;
        }
        event.preventDefault();
        const moved = moveTopLevelNode(editor.state, position, direction);
        if (!moved) {
            return;
        }
        editor.view.dispatch(moved.tr);
        // The move re-creates this node view, so refocus the new handle
        requestAnimationFrame(() => {
            const dom = editor.view.nodeDOM(moved.position);
            if (dom instanceof HTMLElement) {
                dom.querySelector<HTMLElement>('[data-drag-handle]')?.focus();
            }
        });
    };
    const actions = editing ? (
        <Group gap="xs" wrap="nowrap">
            <Tooltip label="Drag, or press ↑ ↓, to move">
                {/* A div, not a button: Firefox never starts a drag from a
                    <button>, so role, tabIndex and keys are added by hand */}
                <ActionIcon
                    component="div"
                    role="button"
                    tabIndex={0}
                    aria-label={`Drag chart ${content.chart.name}`}
                    aria-keyshortcuts="ArrowUp ArrowDown"
                    className={styles.chartDragHandle}
                    draggable
                    data-drag-handle
                    onKeyDown={moveWithKeyboard}
                >
                    <MantineIcon icon={IconGripVertical} />
                </ActionIcon>
            </Tooltip>
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
