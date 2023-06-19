import { Colors, Icon } from '@blueprintjs/core';
import { Text } from '@mantine/core';
import React, { FC } from 'react';
import {
    Draggable,
    DraggableStateSnapshot,
    Droppable,
} from 'react-beautiful-dnd';
import { createPortal } from 'react-dom';
import ColumnConfiguration from './ColumnConfiguration';

type DraggablePortalHandlerProps = {
    snapshot: DraggableStateSnapshot;
};

const DraggablePortalHandler: FC<DraggablePortalHandlerProps> = ({
    children,
    snapshot,
}) => {
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
                <div
                    {...dropProps.droppableProps}
                    ref={dropProps.innerRef}
                    style={{
                        minHeight: isDragging ? '30px' : undefined,
                        margin: '7px 0',
                        background: droppableSnapshot.isDraggingOver
                            ? Colors.LIGHT_GRAY4
                            : isDragging
                            ? Colors.LIGHT_GRAY5
                            : undefined,
                    }}
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
                                    <div
                                        ref={innerRef}
                                        {...draggableProps}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            width: '100%',
                                            marginBottom: '10px',
                                            visibility:
                                                isDragging &&
                                                disableReorder &&
                                                !snapshot.isDragging
                                                    ? 'hidden'
                                                    : undefined,
                                            ...draggableProps.style,
                                        }}
                                    >
                                        <Icon
                                            tagName="div"
                                            icon="drag-handle-vertical"
                                            {...dragHandleProps}
                                        />

                                        <div style={{ width: 6 }} />

                                        <ColumnConfiguration fieldId={itemId} />
                                    </div>
                                </DraggablePortalHandler>
                            )}
                        </Draggable>
                    ))}
                    {dropProps.placeholder}
                </div>
            )}
        </Droppable>
    );
};

export default DroppableItemsList;
