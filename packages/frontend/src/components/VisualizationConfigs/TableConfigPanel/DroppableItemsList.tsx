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

// Where a field dragged in from another list would land
export type PivotDropHint = { itemId: string; position: 'before' | 'after' };

type DroppableItemsListProps = {
    droppableId: string;
    itemIds: string[];
    disableReorder: boolean;
    /** Whether the field being dragged may be dropped in this list. */
    canDrop: boolean;
    dropHint: PivotDropHint | null;
    placeholder?: string;
    draggableItemIds?: string[];
    getColumnConfigurationProps?: (
        itemId: string,
    ) => Omit<ColumnConfigurationProps, 'fieldId'>;
};

// Lists that cannot be reordered keep their items still during a drag
const noShiftStrategy = () => null;

const DroppableItemsList: FC<DroppableItemsListProps> = ({
    droppableId,
    itemIds,
    disableReorder,
    canDrop,
    dropHint,
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
        <Stack
            gap="xs"
            className={classes.droppableList}
            data-drop-target={(isDragging && canDrop) || undefined}
            data-drop-over={(isDraggingOver && canDrop) || undefined}
            data-drop-blocked={(isDragging && !canDrop) || undefined}
        >
            <SortableContext
                id={droppableId}
                items={itemIds}
                strategy={
                    disableReorder ? noShiftStrategy : sortingStrategy.vertical
                }
            >
                <Stack
                    gap="xs"
                    ref={setNodeRef}
                    data-pivot-list={droppableId}
                    mih={30}
                    justify="center"
                >
                    {!hasItems ? (
                        <Text size="xs" c="dimmed" ta="center">
                            {isDragging && canDrop ? 'Drop here' : placeholder}
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
                                        data-pivot-item={itemId}
                                        data-drop-hint={
                                            dropHint?.itemId === itemId
                                                ? dropHint.position
                                                : undefined
                                        }
                                        // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                                        style={sortable.style}
                                        className={clsx(
                                            sortable.className,
                                            classes.item,
                                            sortable.isDragging &&
                                                classes.ghostItem,
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
