import {
    Draggable,
    Droppable,
    type DraggableStateSnapshot,
} from '@hello-pangea/dnd';
import { clsx } from '@mantine/core';
import { Group, Stack, Text } from '@mantine-8/core';
import React, { type FC } from 'react';
import { createPortal } from 'react-dom';
import { GrabIcon } from '../common/GrabIcon';
import ColumnConfiguration from './ColumnConfiguration';
import classes from './DroppableItemsList.module.css';

type DraggablePortalHandlerProps = {
    snapshot: DraggableStateSnapshot;
};

const DraggablePortalHandler: FC<
    React.PropsWithChildren<DraggablePortalHandlerProps>
> = ({ children, snapshot }) => {
    if (snapshot.isDragging) return createPortal(children, document.body);
    return <>{children}</>;
};

type DroppableItemsListProps = {
    droppableId: string;
    itemIds: string[];
    isDragging: boolean;
    disableReorder: boolean;
    placeholder?: string;
};

const DroppableItemsList: FC<DroppableItemsListProps> = ({
    droppableId,
    itemIds,
    isDragging,
    disableReorder,
    placeholder,
}) => {
    const hasItems = itemIds.length > 0;
    return (
        <Stack gap="xs" className={classes.droppableContainer}>
            <Droppable droppableId={droppableId}>
                {(dropProps, droppableSnapshot) => (
                    <Stack
                        {...dropProps.droppableProps}
                        gap="xs"
                        ref={dropProps.innerRef}
                        mih={isDragging ? '30px' : undefined}
                        className={clsx(
                            classes.droppableArea,
                            droppableSnapshot.isDraggingOver &&
                                classes.droppableAreaDraggingOver,
                            isDragging &&
                                !droppableSnapshot.isDraggingOver &&
                                classes.droppableAreaDragging,
                        )}
                    >
                        {!isDragging && !hasItems ? (
                            <Text fz="xs" c="ldGray.6" m="xs" ta="center">
                                {placeholder}
                            </Text>
                        ) : null}
                        {itemIds.map((itemId, index) => (
                            <Draggable
                                key={itemId}
                                draggableId={itemId}
                                index={index}
                            >
                                {(
                                    {
                                        draggableProps,
                                        dragHandleProps,
                                        innerRef,
                                    },
                                    snapshot,
                                ) => (
                                    <DraggablePortalHandler snapshot={snapshot}>
                                        <Group
                                            wrap="nowrap"
                                            gap="xs"
                                            ref={innerRef}
                                            {...draggableProps}
                                            style={draggableProps.style}
                                            className={clsx(
                                                classes.draggableItem,
                                                snapshot.isDragging &&
                                                    classes.draggableItemDragging,
                                                isDragging &&
                                                    disableReorder &&
                                                    !snapshot.isDragging &&
                                                    classes.draggableItemHidden,
                                            )}
                                        >
                                            <GrabIcon
                                                dragHandleProps={
                                                    dragHandleProps
                                                }
                                            />

                                            <ColumnConfiguration
                                                fieldId={itemId}
                                            />
                                        </Group>
                                    </DraggablePortalHandler>
                                )}
                            </Draggable>
                        ))}
                        {dropProps.placeholder}
                    </Stack>
                )}
            </Droppable>
        </Stack>
    );
};

export default DroppableItemsList;
