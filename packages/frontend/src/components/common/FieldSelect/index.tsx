import {
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    isField,
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
    ...rest
}: FieldSelectProps<T>): JSX.Element => {
    const sortedItems = useMemo(() => {
        return items.sort((a, b) =>
            getLabel(a, hasGrouping).localeCompare(getLabel(b, hasGrouping)),
        );
    }, [items, hasGrouping]);

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
