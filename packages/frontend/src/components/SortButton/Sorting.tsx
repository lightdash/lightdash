import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from '@hello-pangea/dnd';
import { isField } from '@lightdash/common';
import { Box, Button, Select } from '@mantine/core';
import { mergeRefs } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { forwardRef, useMemo, useState } from 'react';
import { type Props } from '.';
import { useColumns } from '../../hooks/useColumns';
import useExplorerContext from '../../providers/Explorer/useExplorerContext';
import MantineIcon from '../common/MantineIcon';
import SortItem from './SortItem';

const Sorting = forwardRef<HTMLDivElement, Props>(
    ({ sorts, isEditMode }, ref) => {
        const [showSortFieldSelector, setShowSortFieldSelector] =
            useState(false);
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

        const availableColumnsToAddToSort = useMemo(
            () =>
                columns
                    .map((c) => ({
                        label: isField(c.meta?.item)
                            ? c.meta?.item?.label
                            : c.meta?.item?.name,
                        value: c.id || '',
                    }))
                    .filter((c) => !sorts.some((s) => s.fieldId === c.value)),
            [columns, sorts],
        );

        return (
            <>
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
                                                dragHandleProps={
                                                    dragHandleProps
                                                }
                                                sort={sort}
                                                column={columns.find(
                                                    (c) =>
                                                        c.id === sort.fieldId,
                                                )}
                                                onAddSortField={(options) => {
                                                    addSortField(
                                                        sort.fieldId,
                                                        options,
                                                    );
                                                }}
                                                onRemoveSortField={() => {
                                                    removeSortField(
                                                        sort.fieldId,
                                                    );
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
                {isEditMode && availableColumnsToAddToSort.length > 0 && (
                    <Box p="xs" ref={ref}>
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => {
                                setShowSortFieldSelector(true);
                            }}
                            compact
                            leftIcon={<MantineIcon icon={IconPlus} />}
                        >
                            Add sort
                        </Button>
                        {showSortFieldSelector && (
                            <Select
                                placeholder={
                                    availableColumnsToAddToSort.length === 0
                                        ? 'No available columns'
                                        : 'Add sort field'
                                }
                                size="xs"
                                data={availableColumnsToAddToSort}
                                withinPortal
                                onChange={(value: string) => {
                                    addSortField(value);
                                    setShowSortFieldSelector(false);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                disabled={!isEditMode}
                            />
                        )}
                    </Box>
                )}
            </>
        );
    },
);

export default Sorting;
