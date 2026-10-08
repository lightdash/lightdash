import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { IconGripVertical, IconTrash } from '@tabler/icons-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import MantineIcon from '../../../components/common/MantineIcon';
import ErrorBoundary from '../../errorBoundary/ErrorBoundary';
import DocumentLinkedChart from '../DocumentLinkedChart';
import styles from '../presentation/ReportPresentation.module.css';
import { useDocumentEditorTarget } from './DocumentEditorContext';
import { type DocumentSavedChartAttributes } from './documentSavedChartNode';

const DocumentSavedChartNodeView = ({
    node,
    editor,
    deleteNode,
    selected,
}: NodeViewProps) => {
    const { block } = node.attrs as DocumentSavedChartAttributes;
    const target = useDocumentEditorTarget();
    if (!block) {
        return null;
    }
    const actions = editor.isEditable ? (
        <Group gap="xs" wrap="nowrap">
            <Tooltip label="Drag to move">
                {/* A div, not a button: Firefox never starts a drag from a <button> */}
                <ActionIcon
                    component="div"
                    role="button"
                    tabIndex={0}
                    aria-label="Drag linked chart"
                    className={styles.chartDragHandle}
                    draggable
                    data-drag-handle
                >
                    <MantineIcon icon={IconGripVertical} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Remove linked chart">
                <ActionIcon
                    aria-label="Remove linked chart"
                    onClick={deleteNode}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Tooltip>
        </Group>
    ) : undefined;
    return (
        <NodeViewWrapper data-selected={selected || undefined}>
            <ErrorBoundary>
                <DocumentLinkedChart
                    projectUuid={target.projectUuid}
                    spaceUuid={target.spaceUuid}
                    kind={block.kind}
                    attributes={block.attributes}
                    actions={actions}
                />
            </ErrorBoundary>
        </NodeViewWrapper>
    );
};

export default DocumentSavedChartNodeView;
