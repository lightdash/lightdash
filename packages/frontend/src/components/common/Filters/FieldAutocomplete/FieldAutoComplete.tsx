import {
    Field,
    getItemId,
    getItemLabel,
    isField,
    Item,
    TableCalculation,
} from '@lightdash/common';
import { Group, Select, SelectProps, Text } from '@mantine/core';
import { FC, forwardRef, useCallback, useMemo } from 'react';
import FieldIcon from '../FieldIcon';

// id? name? of the field
// disabled
// autoFocus
// placeholder
// activeField <<< value
// fields <<< data ?
// inactiveFieldIds
// onChange
// onClosed
// hasGrouping

interface FieldAutoCompleteProps
    extends Omit<SelectProps, 'items' | 'onChange' | 'data'> {
    field?: Field | TableCalculation;
    fields: (Field | TableCalculation)[];
    inactiveFieldIds?: string[];
    onChange: (value: Field | TableCalculation) => void;
    onClosed?: () => void;
    hasGrouping?: boolean;
}

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    item: Item;
    label: string;
    size?: SelectProps['size'];
    selected?: boolean;
}

const FieldSelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ item, label, size, ...rest }, ref) => (
        <div ref={ref} {...rest}>
            <Group noWrap spacing={size}>
                <FieldIcon item={item} selected={rest.selected} />
                <Text truncate size={size}>
                    {label}
                </Text>
            </Group>
        </div>
    ),
);

const FieldAutoComplete: FC<FieldAutoCompleteProps> = ({
    field,
    fields,
    onChange,
    onClosed,
    placeholder,
    inactiveFieldIds = [],
    hasGrouping = false,
    ...rest
}) => {
    const filteredFields = useMemo(() => {
        return fields.filter((f) => !inactiveFieldIds.includes(getItemId(f)));
    }, [fields, inactiveFieldIds]);

    const sortedItems = useMemo(() => {
        return filteredFields.sort((a, b) =>
            getItemLabel(a).localeCompare(getItemLabel(b)),
        );
    }, [filteredFields]);

    const selectedFieldId = useMemo(() => {
        return field ? getItemId(field) : undefined;
    }, [field]);

    const handleChange = useCallback(
        (value: string) => {
            const selectedField = fields.find((f) => getItemId(f) === value);

            if (!selectedField) return;
            onChange(selectedField);
        },
        [fields, onChange],
    );

    return (
        <Select
            w="100%"
            searchable
            clearable
            {...rest}
            icon={field ? <FieldIcon item={field} /> : undefined}
            value={selectedFieldId}
            itemComponent={FieldSelectItem}
            data={sortedItems.map((i) => ({
                value: getItemId(i),
                label: getItemLabel(i),
                item: i,
                group: hasGrouping && isField(i) ? i.tableLabel : undefined,
                size: rest.size,
            }))}
            onChange={handleChange}
        />
    );
};

export default FieldAutoComplete;
