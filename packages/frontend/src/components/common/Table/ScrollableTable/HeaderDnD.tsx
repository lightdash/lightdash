import { ResultRow } from '@lightdash/common';
import { flexRender, HeaderGroup } from '@tanstack/react-table';
import React, { FC, MutableRefObject } from 'react';
import { DragDropContext, Droppable } from 'react-beautiful-dnd';
import { useTableContext } from '../TableProvider';
import { ROW_NUMBER_COLUMN_ID } from '../types';

type HeaderDndContextProps = {
    colOrderRef: MutableRefObject<string[]>;
};

export const HeaderDndContext: FC<HeaderDndContextProps> = ({
    colOrderRef,
    children,
}) => {
    const { table, onColumnOrderChange } = useTableContext();
    return (
        <DragDropContext
            onDragStart={() => {
                colOrderRef.current = table.getState().columnOrder;
            }}
            onDragUpdate={(dragUpdateObj) => {
                const colOrder = [...colOrderRef.current];
                const sIndex = dragUpdateObj.source.index;
                const dIndex =
                    dragUpdateObj.destination &&
                    dragUpdateObj.destination.index;

                if (typeof dIndex === 'number') {
                    colOrder.splice(sIndex, 1);
                    colOrder.splice(dIndex, 0, dragUpdateObj.draggableId);
                    table.setColumnOrder([ROW_NUMBER_COLUMN_ID, ...colOrder]);
                }
            }}
            onDragEnd={() => {
                onColumnOrderChange?.(
                    table
                        .getState()
                        .columnOrder.filter(
                            (value) => value !== ROW_NUMBER_COLUMN_ID,
                        ),
                );
            }}
        >
            {children}
        </DragDropContext>
    );
};

type HeaderDroppableProps = {
    headerGroup: HeaderGroup<ResultRow>;
};

export const HeaderDroppable: FC<HeaderDroppableProps> = ({
    headerGroup,
    children,
}) => {
    return (
        <Droppable
            droppableId="droppable"
            direction="horizontal"
            renderClone={(provided, snapshot, rubric) => {
                const header = headerGroup.headers.find(
                    ({ id }) => id === rubric.draggableId,
                );
                return (
                    <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        style={{
                            ...provided.draggableProps.style,
                            ...(!snapshot.isDragging && {
                                transform: 'translate(0,0)',
                            }),
                            ...(snapshot.isDropAnimating && {
                                transitionDuration: '0.001s',
                            }),
                        }}
                    >
                        {!header || header.isPlaceholder
                            ? null
                            : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                              )}
                    </div>
                );
            }}
        >
            {(droppableProvided) => (
                <tr
                    ref={droppableProvided.innerRef}
                    {...droppableProvided.droppableProps}
                >
                    {children}
                </tr>
            )}
        </Droppable>
    );
};
