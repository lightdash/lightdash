import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from '@hello-pangea/dnd';
import { isField } from '@lightdash/common';
import { ActionIcon, Button, Group, Select, Text } from '@mantine/core';
import { IconGripVertical, IconPlus, IconX } from '@tabler/icons-react';
import { forwardRef, useState } from 'react';
import { type Props } from '.';
import { useColumns } from '../../hooks/useColumns';
import useExplorerContext from '../../providers/Explorer/useExplorerContext';
import MantineIcon from '../common/MantineIcon';
import SortItem from './SortItem';

const Sorting = forwardRef<HTMLDivElement, Props>(({ sorts, isEditMode }) => {
    const columns = useColumns();
    const [isAddingSort, setIsAddingSort] = useState(false);

    const addSortField = useExplorerContext(
        (context) => context.actions.addSortField,
    );
    const removeSortField = useExplorerContext(
        (context) => context.actions.removeSortField,
    );
    const moveSortFields = useExplorerContext(
        (context) => context.actions.moveSortFields,
    );
    const setSortFieldNullsFirst = useExplorerContext(
        (context) => context.actions.setSortFieldNullsFirst,
    );

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        if (result.destination.index === result.source.index) return;
        moveSortFields(result.source.index, result.destination.index);
    };

    const availableColumnsToAddToSort = columns
        .filter((c) => !sorts.some((s) => s.fieldId === c.id))
        .map((c) => {
            const item = c.meta?.item;
            return {
                value: c.id || '',
                label: item
                    ? isField(item)
                        ? item.label || item.name
                        : item.name
                    : c.id,
            };
        })
        .filter((c) => c.value !== '');

    return (
        <>
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="results-table-sort-fields">
                    {(provided) => (
                        <div
                            ref={provided.innerRef}
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
                                            onSetSortFieldNullsFirst={(
                                                payload,
                                            ) => {
                                                setSortFieldNullsFirst(
                                                    sort.fieldId,
                                                    payload,
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

            {/*
                Add sort to multi-sort form
                Mimics SortItem component
            */}
            {isEditMode && availableColumnsToAddToSort.length > 0 && (
                <>
                    {!isAddingSort ? (
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => setIsAddingSort(true)}
                            compact
                            leftIcon={<MantineIcon icon={IconPlus} />}
                        >
                            Add sort
                        </Button>
                    ) : (
                        <Group
                            noWrap
                            position="apart"
                            pl="xs"
                            pr="xxs"
                            py="two"
                        >
                            <Group spacing="sm">
                                {isEditMode && sorts.length > 0 && (
                                    <MantineIcon
                                        color="gray"
                                        opacity={0.9}
                                        icon={IconGripVertical}
                                    />
                                )}
                                <Text>then by</Text>
                                <Select
                                    placeholder="Add sort field"
                                    size="xs"
                                    data={availableColumnsToAddToSort}
                                    withinPortal
                                    onChange={(value: string) => {
                                        if (value) {
                                            addSortField(value);
                                            setIsAddingSort(false);
                                        }
                                    }}
                                />
                            </Group>
                            <ActionIcon
                                size="sm"
                                onClick={() => setIsAddingSort(false)}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </Group>
                    )}
                </>
            )}
        </>
    );
});

export default Sorting;
