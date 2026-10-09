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
                <Tooltip label="Title in this document">
                    <ActionIcon
                        aria-label="Edit title in this document"
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
                            label="Title in this document"
                            placeholder="The chart's own title"
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
                                    Use the chart's title
                                </Button>
                            )}
                            <Button type="submit" size="xs">
                                Apply
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
