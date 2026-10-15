import {
    ActionIcon,
    Button,
    Group,
    Popover,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import {
    IconGripVertical,
    IconLetterCase,
    IconTrash,
} from '@tabler/icons-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import ErrorBoundary from '../../errorBoundary/ErrorBoundary';
import DocumentLinkedChart from '../DocumentLinkedChart';
import styles from '../presentation/ReportPresentation.module.css';
import { useDocumentEditorTarget } from './DocumentEditorContext';
import { type DocumentSavedChartAttributes } from './documentSavedChartNode';

/** Sets the title this Document shows for the chart; empty uses the chart's own. */
const RetitleButton = ({
    title,
    onChange,
}: {
    title: string | undefined;
    onChange: (title: string | undefined) => void;
}) => {
    const { t } = useTranslation('documents');
    const [opened, setOpened] = useState(false);
    const [value, setValue] = useState(title ?? '');
    const apply = (next: string) => {
        onChange(next.trim() === '' ? undefined : next.trim());
        setOpened(false);
    };
    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom-end"
            trapFocus
        >
            <Popover.Target>
                <Tooltip label={t('savedChartNode.titleLabel')}>
                    <ActionIcon
                        aria-label={t('savedChartNode.editTitle')}
                        onClick={() => {
                            setValue(title ?? '');
                            setOpened((isOpen) => !isOpen);
                        }}
                    >
                        <MantineIcon icon={IconLetterCase} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        apply(value);
                    }}
                >
                    <Stack gap="xs" w={260}>
                        <TextInput
                            label={t('savedChartNode.titleLabel')}
                            placeholder={t('savedChartNode.titlePlaceholder')}
                            value={value}
                            onChange={(event) =>
                                setValue(event.currentTarget.value)
                            }
                            data-autofocus
                        />
                        <Group justify="flex-end" gap="xs">
                            {title !== undefined && (
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={() => apply('')}
                                >
                                    {t('savedChartNode.useChartTitle')}
                                </Button>
                            )}
                            <Button type="submit" size="xs">
                                {t('savedChartNode.apply')}
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Popover.Dropdown>
        </Popover>
    );
};

const DocumentSavedChartNodeView = ({
    node,
    editor,
    deleteNode,
    updateAttributes,
    selected,
}: NodeViewProps) => {
    const { t } = useTranslation('documents');
    const { block } = node.attrs as DocumentSavedChartAttributes;
    const target = useDocumentEditorTarget();
    if (!block) {
        return null;
    }
    const retitle = (title: string | undefined) => {
        const { title: _previous, ...attributes } = block.attributes;
        updateAttributes({
            block: {
                ...block,
                attributes:
                    title === undefined ? attributes : { ...attributes, title },
            },
        } satisfies DocumentSavedChartAttributes);
    };
    const actions = editor.isEditable ? (
        <Group gap="xs" wrap="nowrap">
            <RetitleButton title={block.attributes.title} onChange={retitle} />
            <Tooltip label={t('editor.dragToMove')}>
                {/* A div, not a button: Firefox never starts a drag from a <button> */}
                <ActionIcon
                    component="div"
                    role="button"
                    tabIndex={0}
                    aria-label={t('savedChartNode.drag')}
                    className={styles.chartDragHandle}
                    draggable
                    data-drag-handle
                >
                    <MantineIcon icon={IconGripVertical} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label={t('savedChartNode.remove')}>
                <ActionIcon
                    aria-label={t('savedChartNode.remove')}
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
