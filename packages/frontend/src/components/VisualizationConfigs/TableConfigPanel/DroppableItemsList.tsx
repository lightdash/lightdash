import {
    Draggable,
    Droppable,
    type DraggableStateSnapshot,
} from '@hello-pangea/dnd';
import { Group, Stack, Text } from '@mantine/core';
import React, { type FC } from 'react';
import { createPortal } from 'react-dom';
import { GrabIcon } from '../common/GrabIcon';
import ColumnConfiguration from './ColumnConfiguration';

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
        <Stack
            spacing="xs"
            sx={(theme) => ({
                padding: theme.spacing.xs,
                backgroundColor: theme.colors.gray['0'],
                borderRadius: theme.radius.sm,
            })}
        >
            <Droppable droppableId={droppableId}>
                {(dropProps, droppableSnapshot) => (
                    <Stack
                        {...dropProps.droppableProps}
                        spacing="xs"
                        ref={dropProps.innerRef}
                        mih={isDragging ? '30px' : undefined}
                        bg={
                            droppableSnapshot.isDraggingOver
                                ? 'gray.1'
                                : isDragging
                                ? 'gray.0'
                                : undefined
                        }
                    >
                        {!isDragging && !hasItems ? (
                            <Text size="xs" color="gray.6" m="xs" ta="center">
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
                                            noWrap
                                            spacing="xs"
                                            ref={innerRef}
                                            {...draggableProps}
                                            style={{
                                                visibility:
                                                    isDragging &&
                                                    disableReorder &&
                                                    !snapshot.isDragging
                                                        ? 'hidden'
                                                        : undefined,
                                                ...draggableProps.style,
                                            }}
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
