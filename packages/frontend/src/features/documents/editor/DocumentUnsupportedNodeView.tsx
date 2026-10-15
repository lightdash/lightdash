import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { IconGripVertical, IconTrash } from '@tabler/icons-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('documents');
    const { block } = node.attrs as DocumentUnsupportedAttributes;
    if (!block) {
        return null;
    }
    const kind = block.type === 'unsupportedChart' ? 'chart' : 'block';
    const actions = editor.isEditable ? (
        <Group gap="xs" wrap="nowrap">
            <Tooltip label={t('editor.dragToMove')}>
                {/* A div, not a button: Firefox never starts a drag from a <button> */}
                <ActionIcon
                    component="div"
                    role="button"
                    tabIndex={0}
                    aria-label={t(`unsupported.${kind}.drag`)}
                    className={styles.chartDragHandle}
                    draggable
                    data-drag-handle
                >
                    <MantineIcon icon={IconGripVertical} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label={t(`unsupported.${kind}.remove`)}>
                <ActionIcon
                    aria-label={t(`unsupported.${kind}.remove`)}
                    onClick={deleteNode}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Tooltip>
        </Group>
    ) : undefined;
    return (
        <NodeViewWrapper data-selected={selected || undefined}>
            <ReportChartFrame
                ariaLabel={t(`unsupported.${kind}.ariaLabel`)}
                actions={actions}
                fit="content"
            >
                <Text c="dimmed" size="sm" p="md">
                    {t(`unsupported.${kind}.message`)}
                </Text>
            </ReportChartFrame>
        </NodeViewWrapper>
    );
};

export default DocumentUnsupportedNodeView;
