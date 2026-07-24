import {
    Draggable,
    Droppable,
    type DraggableStateSnapshot,
} from '@hello-pangea/dnd';
import { Group, Stack, Text } from '@mantine-8/core';
import React, { type FC } from 'react';
import { createPortal } from 'react-dom';
import { GrabIcon } from '../common/GrabIcon';
import ColumnConfiguration, {
    type ColumnConfigurationProps,
} from './ColumnConfiguration';

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
    draggableItemIds?: string[];
    getColumnConfigurationProps?: (
        itemId: string,
    ) => Omit<ColumnConfigurationProps, 'fieldId'>;
};

const DroppableItemsList: FC<DroppableItemsListProps> = ({
    droppableId,
    itemIds,
    isDragging,
    disableReorder,
    placeholder,
    draggableItemIds,
    getColumnConfigurationProps,
}) => {
    const hasItems = itemIds.length > 0;
    return (
        <Stack
            gap="xs"
            style={(theme) => ({
                padding: theme.spacing.xs,
                backgroundColor: theme.colors.ldGray?.[0],
                borderRadius: theme.radius.sm,
            })}
        >
            <Droppable droppableId={droppableId}>
                {(dropProps, droppableSnapshot) => (
                    <Stack
                        {...dropProps.droppableProps}
                        gap="xs"
                        ref={dropProps.innerRef}
                        mih={isDragging ? '30px' : undefined}
                        bg={
                            droppableSnapshot.isDraggingOver
                                ? 'ldGray.1'
                                : isDragging
                                  ? 'ldGray.0'
                                  : undefined
                        }
                    >
                        {!isDragging && !hasItems ? (
                            <Text size="xs" c="ldGray.6" m="xs" ta="center">
                                {placeholder}
                            </Text>
                        ) : null}
                        {itemIds.map((itemId, index) => (
                            <Draggable
                                key={itemId}
                                draggableId={itemId}
                                index={index}
                                isDragDisabled={
                                    draggableItemIds !== undefined &&
                                    !draggableItemIds.includes(itemId)
                                }
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
                                            {draggableItemIds === undefined ||
                                            draggableItemIds.includes(
                                                itemId,
                                            ) ? (
                                                <GrabIcon
                                                    dragHandleProps={
                                                        dragHandleProps
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
