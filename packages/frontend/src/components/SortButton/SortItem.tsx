import { formatItemValue, isField, type SortField } from '@lightdash/common';
import { ActionIcon, Box, Group, Select, Text, Tooltip } from '@mantine/core';
import {
    IconGripVertical,
    IconSortAscending,
    IconSortDescending,
    IconX,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { type FC, useMemo } from 'react';
import { useColumns } from '../../hooks/useColumns';
import {
    getSortDirectionOrder,
    getSortLabel,
    getSortNullsFirstValue,
    SortDirection,
    SortNullsFirst,
    sortNullsFirstLabels,
} from '../../utils/sortUtils';
import FieldIcon from '../common/Filters/FieldIcon';
import MantineIcon from '../common/MantineIcon';
import { type SortableItemState } from '../common/Sortable/Sortable';
import { type TableColumn } from '../common/Table/types';
import classes from './SortItem.module.css';

interface SortItemProps {
    isOnlyItem: boolean;
    isEditMode: boolean;
    sort: SortField;
    column?: TableColumn;
    /** This sort's own field plus every column not sorted yet. */
    fieldOptions: { value: string; label: string }[];
    sortable: SortableItemState;
    onAddSortField: (options: { descending: boolean }) => void;
    onChangeField: (fieldId: string) => void;
    onRemoveSortField: () => void;
    onSetSortFieldNullsFirst: (nullsFirst: boolean | undefined) => void;
}

const SortItem: FC<SortItemProps> = ({
    isOnlyItem,
    isEditMode,
    sort,
    column,
    fieldOptions,
    sortable,
    onAddSortField,
    onChangeField,
    onRemoveSortField,
    onSetSortFieldNullsFirst,
}) => {
    const selectedSortDirection = sort.descending
        ? SortDirection.DESC
        : SortDirection.ASC;

    const item = column?.meta?.item;

    const selectedSortNullsFirst = getSortNullsFirstValue(sort);

    const columns = useColumns();
    const pivotLabel = useMemo(() => {
        if (!sort.pivotValues?.length) return null;
        return sort.pivotValues
            .map((pv) => {
                const dimItem = columns.find((c) => c.id === pv.reference)?.meta
                    ?.item;
                const dimLabel =
                    dimItem && isField(dimItem)
                        ? dimItem.label || dimItem.name
                        : pv.reference;
                const valueLabel = dimItem
                    ? (formatItemValue(dimItem, pv.value) ?? String(pv.value))
                    : String(pv.value);
                return `${dimLabel}=${valueLabel}`;
            })
            .join(', ');
    }, [sort.pivotValues, columns]);

    if (!item) {
        return null;
    }

    return (
        <Group
            ref={sortable.ref}
            // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
            style={sortable.style}
            wrap="nowrap"
            gap="xs"
            className={clsx(
                sortable.className,
                classes.sortItem,
                sortable.isDragging && classes.sortItemDragging,
            )}
        >
            {isEditMode && (
                <Box
                    {...sortable.handleProps}
                    className={clsx(
                        sortable.handleProps.className,
                        classes.dragHandle,
                    )}
                    data-disabled={isOnlyItem || undefined}
                >
                    <MantineIcon icon={IconGripVertical} />
                </Box>
            )}

            {pivotLabel ? (
                // A sort on one pivoted column keeps its field: changing it
                // would drop the pivot value it points at
                <Group gap="xs" wrap="nowrap" flex={1} miw={0}>
                    <Text fz="xs" fw={500} truncate>
                        {(isField(item) ? item.label : item.name) ||
                            sort.fieldId}
                    </Text>
                    <Text fz="xs" c="dimmed" truncate>
                        @ {pivotLabel}
                    </Text>
                </Group>
            ) : (
                <Select
                    aria-label="Sort field"
                    size="xs"
                    flex={1}
                    miw={180}
                    searchable
                    allowDeselect={false}
                    disabled={!isEditMode}
                    leftSection={<FieldIcon item={item} size={12} stroke={2} />}
                    data={fieldOptions}
                    value={sort.fieldId}
                    onChange={(value) => {
                        if (value && value !== sort.fieldId) {
                            onChangeField(value);
                        }
                    }}
                    comboboxProps={{ withinPortal: false }}
                />
            )}

            <Select
                aria-label="Sort direction"
                size="xs"
                w={104}
                allowDeselect={false}
                disabled={!isEditMode}
                leftSection={
                    <MantineIcon
                        icon={
                            sort.descending
                                ? IconSortDescending
                                : IconSortAscending
                        }
                    />
                }
                data={getSortDirectionOrder(item).map((direction) => ({
                    label: getSortLabel(item, direction),
                    value: direction,
                }))}
                value={selectedSortDirection}
                onChange={(value) => {
                    if (value) {
                        onAddSortField({
                            descending: value === SortDirection.DESC,
                        });
                    }
                }}
                comboboxProps={{ withinPortal: false }}
            />

            <Select
                aria-label="Nulls position"
                size="xs"
                w={132}
                allowDeselect={false}
                disabled={!isEditMode}
                data={Object.entries(sortNullsFirstLabels).map(
                    ([value, label]) => ({
                        label: `Nulls ${label.toLowerCase()}`,
                        value,
                    }),
                )}
                value={selectedSortNullsFirst}
                onChange={(value) => {
                    if (value) {
                        onSetSortFieldNullsFirst(
                            value === SortNullsFirst.FIRST
                                ? true
                                : value === SortNullsFirst.LAST
                                  ? false
                                  : undefined,
                        );
                    }
                }}
                comboboxProps={{ withinPortal: false }}
            />

            {isEditMode && (
                <Tooltip label="Remove sort">
                    <ActionIcon
                        aria-label="Remove sort"
                        onClick={onRemoveSortField}
                        size="sm"
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default SortItem;
