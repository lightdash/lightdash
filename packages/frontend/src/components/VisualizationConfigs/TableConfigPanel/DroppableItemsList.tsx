import { Box, Group, Text } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import React, { FC } from 'react';
import {
    Draggable,
    DraggableStateSnapshot,
    Droppable,
} from 'react-beautiful-dnd';
import { createPortal } from 'react-dom';
import MantineIcon from '../../common/MantineIcon';
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
    return (
        <Droppable droppableId={droppableId}>
            {(dropProps, droppableSnapshot) => (
                <Box
                    {...dropProps.droppableProps}
                    ref={dropProps.innerRef}
                    mih={isDragging ? '30px' : undefined}
                    p="xs"
                    bg={
                        droppableSnapshot.isDraggingOver
                            ? 'gray.1'
                            : isDragging
                            ? 'gray.0'
                            : undefined
                    }
                >
                    {!isDragging && itemIds.length <= 0 ? (
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
                                { draggableProps, dragHandleProps, innerRef },
                                snapshot,
                            ) => (
                                <DraggablePortalHandler snapshot={snapshot}>
                                    <Group
                                        noWrap
                                        spacing="xs"
                                        mb="xs"
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
                                        <Box
                                            {...dragHandleProps}
                                            sx={{
                                                opacity: 0.6,
                                                '&:hover': { opacity: 1 },
                                            }}
                                        >
                                            <MantineIcon
                                                icon={IconGripVertical}
                                            />
                                        </Box>

                                        <ColumnConfiguration fieldId={itemId} />
                                    </Group>
                                </DraggablePortalHandler>
                            )}
                        </Draggable>
                    ))}
                    {dropProps.placeholder}
                </Box>
            )}
        </Droppable>
    );
};

export default DroppableItemsList;
