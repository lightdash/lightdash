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
    Stack,
    Tooltip,
} from '@mantine/core';
import { IconGripVertical, IconPlus, IconX } from '@tabler/icons-react';
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
import { SortableItem, SortableList } from '../common/Sortable/Sortable';
import classes from './Sorting.module.css';
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

    // Swaps the field a sort is on, keeping its direction and nulls position
    const changeSortField = useCallback(
        (identity: PivotSortIdentity, fieldId: string) => {
            const newSorts = sorts.map((s) =>
                matchesIdentity(s, identity)
                    ? {
                          fieldId,
                          descending: s.descending,
                          ...(s.nullsFirst !== undefined && {
                              nullsFirst: s.nullsFirst,
                          }),
                      }
                    : s,
            );
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

    const sortKeys = sorts.map((sort) =>
        serializeIdentity({
            fieldId: sort.fieldId,
            pivotValues: sort.pivotValues,
        }),
    );

    const columnOptions = columns
        .map((c) => {
            const item = c.meta?.item;
            if (!item || !c.id) return null;
            const label =
                (isField(item) ? item.label || item.name : item.name) || c.id;
            return { fieldId: c.id, item, label } as IdentityWithItem;
        })
        .filter((c): c is IdentityWithItem => c !== null)
        .map((opt) => ({ value: opt.fieldId, label: opt.label }));
    const addOptions = columnOptions.filter(
        (opt) => !sorts.some((s) => matchesIdentity(s, { fieldId: opt.value })),
    );

    const resetAddState = () => setIsAddingSort(false);

    const handleAdd = (value: string | null) => {
        if (!value) return;
        addSortField({ fieldId: value });
        resetAddState();
    };

    const hasAddableSomething = addOptions.length > 0;

    return (
        <Stack gap="xs">
            <SortableList
                items={sortKeys}
                onReorder={(from, to) => moveSortFields(from, to)}
            >
                {sorts.map((sort, index) => {
                    const identity: PivotSortIdentity = {
                        fieldId: sort.fieldId,
                        pivotValues: sort.pivotValues,
                    };
                    const key = sortKeys[index];
                    return (
                        <SortableItem key={key} id={key} disabled={!isEditMode}>
                            {(sortable) => (
                                <SortItem
                                    isEditMode={isEditMode}
                                    sortable={sortable}
                                    isOnlyItem={sorts.length === 1}
                                    sort={sort}
                                    column={columns.find(
                                        (c) => c.id === sort.fieldId,
                                    )}
                                    fieldOptions={columnOptions.filter(
                                        (opt) =>
                                            opt.value === sort.fieldId ||
                                            addOptions.includes(opt),
                                    )}
                                    onChangeField={(fieldId) => {
                                        changeSortField(identity, fieldId);
                                    }}
                                    onAddSortField={(opts) => {
                                        addSortField(identity, opts);
                                    }}
                                    onRemoveSortField={() => {
                                        removeSortField(identity);
                                    }}
                                    onSetSortFieldNullsFirst={(payload) => {
                                        setSortFieldNullsFirst(
                                            identity,
                                            payload,
                                        );
                                    }}
                                />
                            )}
                        </SortableItem>
                    );
                })}
            </SortableList>

            {isEditMode && hasAddableSomething && (
                <>
                    {isAddingSort && (
                        <Group wrap="nowrap" gap="xs" miw={500}>
                            <MantineIcon
                                icon={IconGripVertical}
                                className={classes.placeholderHandle}
                            />
                            <Select
                                aria-label="Sort field"
                                placeholder="Choose a field to sort by"
                                size="xs"
                                searchable
                                autoFocus
                                data={addOptions}
                                value={null}
                                onChange={handleAdd}
                                flex={1}
                                comboboxProps={{ withinPortal: false }}
                            />
                            <Tooltip label="Cancel">
                                <ActionIcon
                                    aria-label="Cancel"
                                    size="sm"
                                    onClick={resetAddState}
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    )}
                    <Button
                        variant="default"
                        size="compact-xs"
                        className={classes.addSort}
                        disabled={isAddingSort}
                        onClick={() => setIsAddingSort(true)}
                        leftSection={<MantineIcon icon={IconPlus} />}
                    >
                        Add sort
                    </Button>
                </>
            )}
        </Stack>
    );
});

export default Sorting;
