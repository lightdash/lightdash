import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { IconGripVertical, IconTrash } from '@tabler/icons-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import MantineIcon from '../../../components/common/MantineIcon';
import ReportChartFrame from '../presentation/ReportChartFrame';
import styles from '../presentation/ReportPresentation.module.css';
import { type DocumentUnsupportedAttributes } from './documentUnsupportedNode';

const DocumentUnsupportedNodeView = ({
    node,
    editor,
    deleteNode,
    selected,
}: NodeViewProps) => {
    const { block } = node.attrs as DocumentUnsupportedAttributes;
    if (!block) {
        return null;
    }
    const label = block.type === 'unsupportedChart' ? 'chart' : 'block';
    const actions = editor.isEditable ? (
        <Group gap="xs" wrap="nowrap">
            <Tooltip label="Drag to move">
                {/* A div, not a button: Firefox never starts a drag from a <button> */}
                <ActionIcon
                    component="div"
                    role="button"
                    tabIndex={0}
                    aria-label={`Drag ${label}`}
                    className={styles.chartDragHandle}
                    draggable
                    data-drag-handle
                >
                    <MantineIcon icon={IconGripVertical} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label={`Remove ${label}`}>
                <ActionIcon aria-label={`Remove ${label}`} onClick={deleteNode}>
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Tooltip>
        </Group>
    ) : undefined;
    return (
        <NodeViewWrapper data-selected={selected || undefined}>
            <ReportChartFrame
                ariaLabel={`Unsupported ${label}`}
                actions={actions}
                fit="content"
            >
                <Text c="dimmed" size="sm" p="md">
                    {`This ${label} was added in a newer version and can't be shown here.`}
                </Text>
            </ReportChartFrame>
        </NodeViewWrapper>
    );
};

export default DocumentUnsupportedNodeView;
