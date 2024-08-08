import {
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
    isTableCalculation,
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
            if (isDimension(i)) return 1;
            if (isCustomDimension(i)) return 2;
            if (isMetric(i)) return 3; // Additional metrics are compiled as metrics
            return 4; // Table calculations have the lowest priority
        };

        return [
            map,
            [...items].sort((a, b) => {
                /**
                 * Sorting logic:
                 * Sorts by table first
                 * Then sorts by type
                 * 1. Dimensions
                 * 2. Custom dimensions
                 * 3. Metrics & Additional metrics
                 * 4. Table calculations
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

                if (baseTable) {
                    const aIsInTable = 'table' in a && a.table === baseTable;
                    const bIsInTable = 'table' in b && b.table === baseTable;
                    if (aIsInTable !== bIsInTable) return aIsInTable ? -1 : 1;
                }

                const priorityDiff = getTypePriority(a) - getTypePriority(b);
                if (priorityDiff !== 0) return priorityDiff;

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
