import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { Group, Stack, Text } from '@mantine/core';
import clsx from 'clsx';
import { type FC } from 'react';
import { SortableItem } from '../../common/Sortable/Sortable';
import { sortingStrategy } from '../../common/Sortable/sortableUtils';
import { GrabIcon } from '../common/GrabIcon';
import ColumnConfiguration, {
    type ColumnConfigurationProps,
} from './ColumnConfiguration';
import classes from './DroppableItemsList.module.css';

type DroppableItemsListProps = {
    droppableId: string;
    itemIds: string[];
    disableReorder: boolean;
    placeholder?: string;
    draggableItemIds?: string[];
    getColumnConfigurationProps?: (
        itemId: string,
    ) => Omit<ColumnConfigurationProps, 'fieldId'>;
};

const DroppableItemsList: FC<DroppableItemsListProps> = ({
    droppableId,
    itemIds,
    disableReorder,
    placeholder,
    draggableItemIds,
    getColumnConfigurationProps,
}) => {
    const { active, over } = useDndContext();
    const { setNodeRef } = useDroppable({ id: droppableId });
    const isDragging = active !== null;
    const isDraggingOver =
        over !== null &&
        (over.id === droppableId || itemIds.some((id) => id === over.id));
    const hasItems = itemIds.length > 0;
    return (
        <Stack gap="xs" className={classes.droppableList}>
            <SortableContext
                id={droppableId}
                items={itemIds}
                strategy={sortingStrategy.vertical}
            >
                <Stack
                    gap="xs"
                    ref={setNodeRef}
                    mih={isDragging ? '30px' : undefined}
                    bg={
                        isDraggingOver
                            ? 'ldGray.1'
                            : isDragging
                              ? 'ldGray.0'
                              : undefined
                    }
                >
                    {!isDragging && !hasItems ? (
                        <Text size="xs" c="dimmed" m="xs" ta="center">
                            {placeholder}
                        </Text>
                    ) : null}
                    {itemIds.map((itemId) => {
                        const isDraggable =
                            draggableItemIds === undefined ||
                            draggableItemIds.includes(itemId);
                        return (
                            <SortableItem
                                key={itemId}
                                id={itemId}
                                disabled={!isDraggable}
                            >
                                {(sortable) => (
                                    <Group
                                        wrap="nowrap"
                                        gap="xs"
                                        ref={sortable.ref}
                                        // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                                        style={sortable.style}
                                        className={clsx(
                                            sortable.className,
                                            (sortable.isDragging ||
                                                (isDragging &&
                                                    disableReorder)) &&
                                                classes.hiddenItem,
                                        )}
                                    >
                                        {isDraggable ? (
                                            <GrabIcon
                                                dragHandleProps={
                                                    sortable.handleProps
                                                }
                                            />
                                        ) : null}

                                        <ColumnConfiguration
                                            fieldId={itemId}
                                            {...getColumnConfigurationProps?.(
                                                itemId,
                                            )}
                                        />
                                    </Group>
                                )}
                            </SortableItem>
                        );
                    })}
                </Stack>
            </SortableContext>
        </Stack>
    );
};

export default DroppableItemsList;
