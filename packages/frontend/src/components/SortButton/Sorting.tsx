import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from '@hello-pangea/dnd';
import { mergeRefs } from '@mantine/hooks';
import { forwardRef } from 'react';
import { type Props } from '.';
import { useColumns } from '../../hooks/useColumns';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import SortItem from './SortItem';

const Sorting = forwardRef<HTMLDivElement, Props>(
    ({ sorts, isEditMode }, ref) => {
        const columns = useColumns();

        const addSortField = useExplorerContext(
            (context) => context.actions.addSortField,
        );
        const removeSortField = useExplorerContext(
            (context) => context.actions.removeSortField,
        );
        const moveSortFields = useExplorerContext(
            (context) => context.actions.moveSortFields,
        );

        const onDragEnd = (result: DropResult) => {
            if (!result.destination) return;
            if (result.destination.index === result.source.index) return;
            moveSortFields(result.source.index, result.destination.index);
        };

        return (
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="results-table-sort-fields">
                    {(provided) => (
                        <div
                            ref={mergeRefs(provided.innerRef, ref)}
                            {...provided.droppableProps}
                        >
                            {sorts.map((sort, index) => (
                                <Draggable
                                    key={sort.fieldId}
                                    isDragDisabled={!isEditMode}
                                    draggableId={sort.fieldId}
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
                                        <SortItem
                                            isEditMode={isEditMode}
                                            ref={innerRef}
                                            isFirstItem={index === 0}
                                            isOnlyItem={sorts.length === 1}
                                            isDragging={snapshot.isDragging}
                                            draggableProps={draggableProps}
                                            dragHandleProps={dragHandleProps}
                                            sort={sort}
                                            column={columns.find(
                                                (c) => c.id === sort.fieldId,
                                            )}
                                            onAddSortField={(options) => {
                                                addSortField(
                                                    sort.fieldId,
                                                    options,
                                                );
                                            }}
                                            onRemoveSortField={() => {
                                                removeSortField(sort.fieldId);
                                            }}
                                        />
                                    )}
                                </Draggable>
                            ))}

                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        );
    },
);

export default Sorting;
