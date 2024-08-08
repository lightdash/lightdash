import {
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
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
    tableName?: string;
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
    tableName,
    ...rest
}: FieldSelectProps<T>): JSX.Element => {
    const sortedItems = useMemo(() => {
        // Give priority to items in the table === tableName
        // Then, sort by type - dimensions first, then custom dimensions, then metrics, then custom metrics, then table calculations
        // Then, sort alphabetically by label

        return items.sort((a, b) => {
            if (tableName) {
                const aIsInTable = 'table' in a && a.table === tableName;
                const bIsInTable = 'table' in b && b.table === tableName;

                if (aIsInTable && !bIsInTable) return -1;
                if (!aIsInTable && bIsInTable) return 1;
            }

            const getTypePriority = (i: Item) => {
                if (isDimension(i)) return 1;
                if (isCustomDimension(i)) return 2;
                if (isMetric(i)) return 3;
                if (isAdditionalMetric(i)) return 4;

                // Assume table calculations have the lowest priority
                return 5;
            };

            const priorityA = getTypePriority(a);
            const priorityB = getTypePriority(b);

            // Sort by type priority
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // If same type, sort alphabetically by label
            return getLabel(a, hasGrouping).localeCompare(
                getLabel(b, hasGrouping),
            );
        });
    }, [items, tableName, hasGrouping]);

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
                group: hasGrouping && isField(i) ? i.tableLabel : undefined,
                disabled: inactiveItemIds.includes(getItemId(i)),
                size: rest.size,
            }))}
            onChange={handleChange}
        />
    );
};

export default FieldSelect;
