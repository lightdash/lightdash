import {
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
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
    Group,
    Select,
    Text,
    Tooltip,
    type SelectProps,
} from '@mantine/core';
import { forwardRef, useCallback, useMemo } from 'react';
import FieldIcon from '../Filters/FieldIcon';

interface ItemComponentProps extends React.ComponentPropsWithoutRef<'div'> {
    item: Item;
    label: string;
    description?: string;
    size?: SelectProps['size'];
    selected?: boolean;
}

const ItemComponent = forwardRef<HTMLDivElement, ItemComponentProps>(
    ({ item, label, description, size, ...rest }, ref) => (
        <Tooltip
            disabled={!description}
            label={
                <Text truncate size={size}>
                    {description}
                </Text>
            }
            position="top"
            multiline
            maw={400}
            offset={-2}
            withinPortal
            openDelay={500}
        >
            <Box ref={ref} {...rest}>
                <Group
                    noWrap
                    spacing={size}
                    maw="100%"
                    sx={{ overflow: 'hidden' }}
                >
                    <FieldIcon
                        style={{ flexShrink: 0 }}
                        item={item}
                        selected={rest.selected}
                    />
                    <Text truncate size={size}>
                        {label}
                    </Text>
                </Group>
            </Box>
        </Tooltip>
    ),
);

type FieldSelectProps<T extends Item = Item> = Omit<
    SelectProps,
    'value' | 'data' | 'onChange'
> & {
    item?: T;
    items: T[];
    inactiveItemIds?: string[];
    onChange: (value: T | undefined) => void;
    onClosed?: () => void;
    hasGrouping?: boolean;
    baseTable?: string;
};

const getLabel = (item: Item, hasGrouping: boolean) => {
    return hasGrouping
        ? getItemLabelWithoutTableName(item)
        : getItemLabel(item);
};

const FieldSelect = <T extends Item = Item>({
    item,
    items,
    onChange,
    onClosed,
    inactiveItemIds = [],
    hasGrouping = false,
    baseTable,
    ...rest
}: FieldSelectProps<T>): JSX.Element => {
    const [tableLabelMap, sortedItems] = useMemo(() => {
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

        return [
            map,
            [...items].sort((a, b) => {
                /**
                 * Sorting logic:
                 * Sorts by table first
                 * Then sorts by type
                 * 1. Dimensions & Custom dimensions (interval-type dimensions are sorted by time frame, instead of label)
                 * 2. Metrics & Additional metrics
                 * 3. Table calculations
                 * Then sorts by label
                 */
                if (
                    isField(a) &&
                    !isCustomDimension(a) &&
                    a.table &&
                    a.tableLabel
                ) {
                    map.set(a.table, a.tableLabel);
                }
                if (
                    isField(b) &&
                    !isCustomDimension(b) &&
                    b.table &&
                    b.tableLabel
                ) {
                    map.set(b.table, b.tableLabel);
                }

                // Prioritise items from the base table
                if (baseTable) {
                    const aIsInTable = 'table' in a && a.table === baseTable;
                    const bIsInTable = 'table' in b && b.table === baseTable;
                    if (aIsInTable !== bIsInTable) return aIsInTable ? -1 : 1;
                }

                // Sort by table label for items from different tables
                if (isField(a) && isField(b) && a.table !== b.table) {
                    return (a.tableLabel || '').localeCompare(
                        b.tableLabel || '',
                    );
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
            }),
        ];
    }, [items, baseTable, hasGrouping]);

    const selectedItemId = useMemo(() => {
        return item ? getItemId(item) : undefined;
    }, [item]);

    const handleChange = useCallback(
        (value: string) => {
            const selectedField = items.find((f) => getItemId(f) === value);
            onChange(selectedField);
        },
        [items, onChange],
    );

    return (
        <Select
            w="100%"
            searchable
            styles={{
                separator: {
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    backgroundColor: 'white',
                },
                separatorLabel: {
                    fontWeight: 600,
                },
            }}
            dropdownComponent="div"
            itemComponent={ItemComponent}
            icon={item ? <FieldIcon item={item} /> : undefined}
            placeholder={rest.placeholder ?? 'Search field...'}
            allowDeselect={false}
            {...rest}
            value={selectedItemId}
            data={sortedItems.map((i) => ({
                item: i,
                value: getItemId(i),
                label: getLabel(i, hasGrouping),
                description: isField(i) ? i.description : undefined,
                group:
                    hasGrouping && isField(i)
                        ? i.tableLabel
                        : isCustomDimension(i)
                        ? tableLabelMap.get(i.table) // Custom dimensions don't have table labels, so we use the table map to get them
                        : isTableCalculation(i)
                        ? 'Table Calculations'
                        : undefined,
                disabled: inactiveItemIds.includes(getItemId(i)),
                size: rest.size,
            }))}
            onChange={handleChange}
        />
    );
};

export default FieldSelect;
