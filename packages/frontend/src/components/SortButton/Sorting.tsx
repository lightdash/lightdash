import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from '@hello-pangea/dnd';
import {
    isField,
    type CustomDimension,
    type Field,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Select,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconGripVertical, IconMinus, IconPlus } from '@tabler/icons-react';
import { forwardRef, useCallback, useState } from 'react';
import { type Props } from '.';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../features/explorer/store';
import { useColumns } from '../../hooks/useColumns';
import {
    matchesIdentity,
    serializeIdentity,
    type PivotSortIdentity,
} from '../../utils/pivotSortIdentity';
import MantineIcon from '../common/MantineIcon';
import { DraggablePortalHandler } from '../VisualizationConfigs/TreemapConfig/DraggablePortalHandler';
import SortItem from './SortItem';

type IdentityWithItem = {
    fieldId: string;
    item: Field | TableCalculation | CustomDimension;
    label: string;
};

const Sorting = forwardRef<HTMLDivElement, Props>(({ sorts, isEditMode }) => {
    const columns = useColumns();
    const [isAddingSort, setIsAddingSort] = useState(false);
    const dispatch = useExplorerDispatch();

    const addSortField = useCallback(
        (identity: PivotSortIdentity, options?: { descending: boolean }) => {
            const existingSort = sorts.find((s) =>
                matchesIdentity(s, identity),
            );
            const newSort: SortField = {
                fieldId: identity.fieldId,
                descending: options?.descending ?? false,
                ...(identity.pivotValues?.length && {
                    pivotValues: identity.pivotValues,
                }),
                ...(existingSort?.nullsFirst !== undefined && {
                    nullsFirst: existingSort.nullsFirst,
                }),
            };

            if (existingSort) {
                const newSorts = sorts.map((s) =>
                    matchesIdentity(s, identity) ? newSort : s,
                );
                dispatch(explorerActions.setSortFields(newSorts));
            } else {
                dispatch(explorerActions.setSortFields([...sorts, newSort]));
            }
        },
        [dispatch, sorts],
    );

    const removeSortField = useCallback(
        (identity: PivotSortIdentity) => {
            const newSorts = sorts.filter((s) => !matchesIdentity(s, identity));
            dispatch(explorerActions.setSortFields(newSorts));
        },
        [dispatch, sorts],
    );

    const moveSortFields = useCallback(
        (sourceIndex: number, destinationIndex: number) => {
            const newSorts = [...sorts];
            const [removed] = newSorts.splice(sourceIndex, 1);
            newSorts.splice(destinationIndex, 0, removed);
            dispatch(explorerActions.setSortFields(newSorts));
        },
        [dispatch, sorts],
    );

    const setSortFieldNullsFirst = useCallback(
        (identity: PivotSortIdentity, nullsFirst: boolean | undefined) => {
            const newSorts = sorts.map((s) =>
                matchesIdentity(s, identity) ? { ...s, nullsFirst } : s,
            );
            dispatch(explorerActions.setSortFields(newSorts));
        },
        [dispatch, sorts],
    );

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        if (result.destination.index === result.source.index) return;
        moveSortFields(result.source.index, result.destination.index);
    };

    const addOptions = columns
        .map((c) => {
            const item = c.meta?.item;
            if (!item || !c.id) return null;
            const label =
                (isField(item) ? item.label || item.name : item.name) || c.id;
            return { fieldId: c.id, item, label } as IdentityWithItem;
        })
        .filter((c): c is IdentityWithItem => c !== null)
        .filter(
            (opt) =>
                !sorts.some((s) =>
                    matchesIdentity(s, { fieldId: opt.fieldId }),
                ),
        )
        .map((opt) => ({ value: opt.fieldId, label: opt.label }));

    const resetAddState = () => setIsAddingSort(false);

    const handleAdd = (value: string | null) => {
        if (!value) return;
        addSortField({ fieldId: value });
        resetAddState();
    };

    const hasAddableSomething = addOptions.length > 0;

    return (
        <>
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="results-table-sort-fields">
                    {(provided) => (
                        <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                        >
                            {sorts.map((sort, index) => {
                                const identity: PivotSortIdentity = {
                                    fieldId: sort.fieldId,
                                    pivotValues: sort.pivotValues,
                                };
                                const key = serializeIdentity(identity);
                                return (
                                    <Draggable
                                        key={key}
                                        isDragDisabled={!isEditMode}
                                        draggableId={key}
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
                                            <DraggablePortalHandler
                                                snapshot={snapshot}
                                            >
                                                <SortItem
                                                    isEditMode={isEditMode}
                                                    ref={innerRef}
                                                    isFirstItem={index === 0}
                                                    isOnlyItem={
                                                        sorts.length === 1
                                                    }
                                                    isDragging={
                                                        snapshot.isDragging
                                                    }
                                                    draggableProps={
                                                        draggableProps
                                                    }
                                                    dragHandleProps={
                                                        dragHandleProps
                                                    }
                                                    sort={sort}
                                                    column={columns.find(
                                                        (c) =>
                                                            c.id ===
                                                            sort.fieldId,
                                                    )}
                                                    onAddSortField={(opts) => {
                                                        addSortField(
                                                            identity,
                                                            opts,
                                                        );
                                                    }}
                                                    onRemoveSortField={() => {
                                                        removeSortField(
                                                            identity,
                                                        );
                                                    }}
                                                    onSetSortFieldNullsFirst={(
                                                        payload,
                                                    ) => {
                                                        setSortFieldNullsFirst(
                                                            identity,
                                                            payload,
                                                        );
                                                    }}
                                                />
                                            </DraggablePortalHandler>
                                        )}
                                    </Draggable>
                                );
                            })}

                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>

            {isEditMode && hasAddableSomething && (
                <>
                    {!isAddingSort ? (
                        <Button
                            variant="light"
                            color="gray"
                            size="compact-xs"
                            onClick={() => setIsAddingSort(true)}
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            Add sort
                        </Button>
                    ) : (
                        <Group wrap="nowrap" gap="sm" pl="xs" py="two">
                            {sorts.length > 0 && (
                                <MantineIcon
                                    color="ldGray.5"
                                    opacity={0.9}
                                    icon={IconGripVertical}
                                    style={{ cursor: 'grab' }}
                                />
                            )}
                            <Text fz="xs">then by</Text>
                            <Select
                                placeholder="Column"
                                size="xs"
                                searchable
                                data={addOptions}
                                value={null}
                                onChange={handleAdd}
                                flex={1}
                                comboboxProps={{ withinPortal: false }}
                            />
                            <Tooltip label="Cancel">
                                <ActionIcon
                                    size="xs"
                                    variant="subtle"
                                    color="ldGray.6"
                                    onClick={resetAddState}
                                >
                                    <MantineIcon icon={IconMinus} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    )}
                </>
            )}
        </>
    );
});

export default Sorting;
