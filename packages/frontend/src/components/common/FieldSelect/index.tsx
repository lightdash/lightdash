import {
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    interpolateUiString,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
    isTableCalculation,
    sortTimeFrames,
    type Item,
} from '@lightdash/common';
import {
    Box,
    CheckIcon,
    Group,
    Loader,
    Select,
    Text,
    Tooltip,
    type ComboboxItem,
    type SelectProps,
} from '@mantine/core';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { FILTER_SELECT_LIMIT } from '../Filters/constants';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import FieldIcon from '../Filters/FieldIcon';
import classes from './FieldSelect.module.css';
import {
    ADD_TO_QUERY_GROUP_LABEL,
    MORE_OPTIONS_VALUE,
    optionsFilter,
    SUGGESTED_GROUP_LABEL,
} from './optionsFilter';

interface FieldSelectItem extends ComboboxItem {
    item: Item;
    description?: string;
    size?: SelectProps['size'];
    /** Dimmed table context rendered before the label; the "Add to query"
     *  group has no per-table headers to carry it. */
    tablePrefix?: string;
}

type FieldSelectProps<T extends Item = Item> = Omit<
    SelectProps,
    'value' | 'data' | 'onChange'
> & {
    item?: T;
    items: T[];
    /** Fields not in the query yet, offered under an "Add to query" group.
     *  Picking one reaches `onChange` like any other item. */
    addItems?: T[];
    /** Items from `items` to lift into a leading "Suggested" group, in the
     *  order given; they leave their table group so each is listed once. */
    suggestedItems?: T[];
    /** Shows a spinner while the slot waits on a query run, replacing any
     *  `rightSection` for the duration. */
    loading?: boolean;
    inactiveItemIds?: string[];
    onChange: (value: T | undefined) => void;
    onClosed?: () => void;
    hasGrouping?: boolean;
    baseTable?: string;
    focusOnRender?: boolean;
};

const getLabel = (item: Item, hasGrouping: boolean) => {
    return hasGrouping
        ? getItemLabelWithoutTableName(item)
        : getItemLabel(item);
};

const FieldSelectComponent = <T extends Item = Item>({
    item,
    items,
    addItems,
    suggestedItems,
    loading = false,
    onChange,
    onClosed,
    inactiveItemIds = [],
    hasGrouping = false,
    baseTable,
    focusOnRender = false,
    ...rest
}: FieldSelectProps<T>) => {
    const inputRef = useRef<HTMLInputElement | null>(null); // Input ref for focus handling
    useEffect(() => {
        if (focusOnRender) {
            // focus on the input after the component has rendered by throwing it to the end of the event loop first
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                }
            }, 1);
        }
    }, [focusOnRender]);

    const [tableLabelMap, sortedItems, sortedAddItems] = useMemo(() => {
        const map = new Map<string, string>();

        const getTypePriority = (i: Item): number => {
            if (isDimension(i) || isCustomDimension(i)) return 1;
            if (isMetric(i)) return 2; // Additional metrics are compiled as metrics
            return 3; // Table calculations have the lowest priority
        };

        const getGroupKey = (i: Item): string => {
            if (
                isDimension(i) &&
                'timeIntervalBaseDimensionName' in i &&
                i.timeIntervalBaseDimensionName
            ) {
                return i.timeIntervalBaseDimensionName;
            }

            // TODO: We should handle group and group label ?
            return i.name;
        };

        /**
         * Sorting logic:
         * Sorts by table first
         * Then sorts by type
         * 1. Dimensions & Custom dimensions (interval-type dimensions are sorted by time frame, instead of label)
         * 2. Metrics & Additional metrics
         * 3. Table calculations
         * Then sorts by label
         */
        const compare = (a: T, b: T): number => {
            // Prioritise items from the base table
            if (baseTable) {
                const aIsInTable = 'table' in a && a.table === baseTable;
                const bIsInTable = 'table' in b && b.table === baseTable;
                if (aIsInTable !== bIsInTable) return aIsInTable ? -1 : 1;
            }

            // Sort by table label for items from different tables
            if (isField(a) && isField(b) && a.table !== b.table) {
                return (a.tableLabel || '').localeCompare(b.tableLabel || '');
            }

            // Sort by item type priority (dimensions + custom dimensions > metrics + custom metrics > table calculations)
            const priorityDiff = getTypePriority(a) - getTypePriority(b);
            if (priorityDiff !== 0) return priorityDiff;

            // Sort by group (timeIntervalBaseDimensionName or name)
            const groupComparison = getGroupKey(a).localeCompare(
                getGroupKey(b),
            );
            if (groupComparison !== 0) return groupComparison;

            // Within the same group, sort time-based dimensions by their time interval
            if (
                isDimension(a) &&
                isDimension(b) &&
                'timeInterval' in a &&
                'timeInterval' in b &&
                a.timeInterval &&
                b.timeInterval
            ) {
                return sortTimeFrames(a.timeInterval, b.timeInterval);
            }

            return getLabel(a, hasGrouping).localeCompare(
                getLabel(b, hasGrouping),
            );
        };

        const itemIds = new Set(items.map(getItemId));
        const dedupedAddItems = (addItems ?? []).filter(
            (i) => !itemIds.has(getItemId(i)),
        );
        const suggestedIds = new Set((suggestedItems ?? []).map(getItemId));
        const groupedItems = items.filter(
            (i) => !suggestedIds.has(getItemId(i)),
        );

        [...items, ...dedupedAddItems].forEach((i) => {
            if (
                isField(i) &&
                !isCustomDimension(i) &&
                i.table &&
                i.tableLabel
            ) {
                map.set(i.table, i.tableLabel);
            }
        });

        return [map, groupedItems.sort(compare), dedupedAddItems.sort(compare)];
    }, [items, addItems, suggestedItems, baseTable, hasGrouping]);

    const selectedItemId = useMemo(() => {
        return item ? getItemId(item) : null;
    }, [item]);

    const handleChange = useCallback(
        (value: string | null) => {
            const selectedField = value
                ? (items.find((f) => getItemId(f) === value) ??
                  sortedAddItems.find((f) => getItemId(f) === value))
                : undefined;
            onChange(selectedField);
        },
        [items, sortedAddItems, onChange],
    );

    const selectData = useMemo(() => {
        const itemEntries = sortedItems.map((i) => {
            const group =
                hasGrouping && isField(i)
                    ? i.tableLabel
                    : isCustomDimension(i)
                      ? tableLabelMap.get(i.table) // Custom dimensions don't have table labels, so we use the table map to get them
                      : isTableCalculation(i)
                        ? 'Table Calculations'
                        : undefined;
            const entry: FieldSelectItem = {
                item: i,
                value: getItemId(i),
                label: getLabel(i, hasGrouping),
                description: isField(i) ? i.description : undefined,
                disabled: inactiveItemIds.includes(getItemId(i)),
            };
            return { group, entry };
        });

        const ungrouped = itemEntries
            .filter((e) => !e.group)
            .map((e) => e.entry);

        const grouped = new Map<string, FieldSelectItem[]>();
        for (const { group, entry } of itemEntries) {
            if (group) {
                const existing = grouped.get(group);
                if (existing) {
                    existing.push(entry);
                } else {
                    grouped.set(group, [entry]);
                }
            }
        }

        const groupedData = [...grouped.entries()].map(
            ([group, groupItems]) => ({
                group,
                items: groupItems,
            }),
        );

        // Not-in-query fields sit in one trailing group. The label matches
        // the in-query options (and the input once picked); the dimmed
        // tablePrefix keeps same-named fields from different tables readable.
        const addEntries: FieldSelectItem[] = sortedAddItems.map((i) => ({
            item: i,
            value: getItemId(i),
            label: getLabel(i, hasGrouping),
            tablePrefix: hasGrouping
                ? isField(i) && !isCustomDimension(i)
                    ? i.tableLabel
                    : isCustomDimension(i)
                      ? tableLabelMap.get(i.table)
                      : undefined
                : undefined,
            description: isField(i) ? i.description : undefined,
            disabled: inactiveItemIds.includes(getItemId(i)),
        }));

        // Suggested fields lead, in the order the caller ranked them, and
        // keep their table as a prefix since they left its group.
        const itemById = new Map(items.map((i) => [getItemId(i), i]));
        const suggestedEntries: FieldSelectItem[] = (suggestedItems ?? [])
            .flatMap((i) => {
                const known = itemById.get(getItemId(i));
                return known ? [known] : [];
            })
            .map((i) => ({
                item: i,
                value: getItemId(i),
                label: getLabel(i, hasGrouping),
                tablePrefix: hasGrouping
                    ? isField(i) && !isCustomDimension(i)
                        ? i.tableLabel
                        : isCustomDimension(i)
                          ? tableLabelMap.get(i.table)
                          : undefined
                    : undefined,
                description: isField(i) ? i.description : undefined,
                disabled: inactiveItemIds.includes(getItemId(i)),
            }));

        return [
            ...(suggestedEntries.length > 0
                ? [{ group: SUGGESTED_GROUP_LABEL, items: suggestedEntries }]
                : []),
            ...ungrouped,
            ...groupedData,
            ...(addEntries.length > 0
                ? [{ group: ADD_TO_QUERY_GROUP_LABEL, items: addEntries }]
                : []),
        ];
    }, [
        items,
        suggestedItems,
        sortedItems,
        sortedAddItems,
        hasGrouping,
        tableLabelMap,
        inactiveItemIds,
    ]);

    const getUiString = useUiStrings();

    const renderOption = useCallback(
        ({ option, checked }: { option: ComboboxItem; checked?: boolean }) => {
            if (option.value === MORE_OPTIONS_VALUE) {
                const count = Number(option.label);
                return (
                    <Text span fz="xs" c="dimmed">
                        {interpolateUiString(
                            getUiString(
                                count === 1
                                    ? 'filters.config.moreFields.singular'
                                    : 'filters.config.moreFields.plural',
                            ),
                            { count: count.toLocaleString() },
                        )}
                    </Text>
                );
            }
            const fieldOption = option as FieldSelectItem;
            const fieldItem = fieldOption.item;
            return (
                <Tooltip
                    disabled={!fieldOption.description}
                    label={
                        <Text truncate size={rest.size}>
                            {fieldOption.description}
                        </Text>
                    }
                    position="top"
                    maw={400}
                    offset={-2}
                    openDelay={500}
                >
                    <Group wrap="nowrap" gap={rest.size} maw="100%">
                        <FieldIcon
                            className={classes.optionIcon}
                            item={fieldItem}
                        />
                        <Text
                            span
                            fz="xs"
                            size={rest.size}
                            style={{ wordBreak: 'normal' }}
                        >
                            {fieldOption.tablePrefix && (
                                <Text span inherit c="dimmed">
                                    {fieldOption.tablePrefix}{' '}
                                </Text>
                            )}
                            {fieldOption.label}
                        </Text>
                        {checked && (
                            <Box component="span" ml="auto" display="flex">
                                <CheckIcon size={12} />
                            </Box>
                        )}
                    </Group>
                </Tooltip>
            );
        },
        [rest.size, getUiString],
    );

    return (
        <Select
            limit={FILTER_SELECT_LIMIT}
            filter={optionsFilter}
            ref={inputRef}
            w="100%"
            miw={250}
            searchable
            classNames={{
                groupLabel: classes.separatorLabel,
            }}
            renderOption={renderOption}
            leftSection={item ? <FieldIcon item={item} /> : undefined}
            placeholder={rest.placeholder ?? 'Search field...'}
            nothingFoundMessage={getUiString(
                'filters.config.noMatchingFields',
            )}
            allowDeselect={false}
            rightSectionPointerEvents={
                rest.clearable || rest.rightSection ? 'all' : 'none'
            }
            {...rest}
            {...(loading && {
                rightSection: <Loader size="xs" />,
                rightSectionPointerEvents: 'none' as const,
            })}
            value={selectedItemId}
            data={selectData}
            onChange={handleChange}
        />
    );
};

// Memoize with generic type support
const FieldSelect = memo(FieldSelectComponent) as typeof FieldSelectComponent;

export default FieldSelect;
