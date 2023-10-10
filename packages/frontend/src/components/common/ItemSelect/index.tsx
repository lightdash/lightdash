import {
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    isField,
    Item,
} from '@lightdash/common';
import { Box, Group, Select, SelectProps, Text, Tooltip } from '@mantine/core';
import { FC, forwardRef, useCallback, useMemo } from 'react';
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
            position="top-start"
            multiline
            maw={400}
            arrowOffset={16}
            offset={-2}
            withinPortal
        >
            <Box ref={ref} {...rest}>
                <Group
                    noWrap
                    spacing={size}
                    maw="100%"
                    sx={{ overflow: 'hidden' }}
                >
                    <FieldIcon item={item} selected={rest.selected} />
                    <Text truncate size={size}>
                        {label}
                    </Text>
                </Group>
            </Box>
        </Tooltip>
    ),
);

interface ItemSelectProps
    extends Omit<SelectProps, 'value' | 'data' | 'onChange'> {
    item?: Item;
    items: Item[];
    inactiveItemIds?: string[];
    onChange: (value: Item | undefined) => void;
    onClosed?: () => void;
    hasGrouping?: boolean;
}

const getLabel = (item: Item, hasGrouping: boolean) => {
    return hasGrouping
        ? getItemLabelWithoutTableName(item)
        : getItemLabel(item);
};

const ItemSelect: FC<ItemSelectProps> = ({
    item,
    items,
    onChange,
    onClosed,
    inactiveItemIds = [],
    hasGrouping = false,
    ...rest
}) => {
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

export default ItemSelect;
