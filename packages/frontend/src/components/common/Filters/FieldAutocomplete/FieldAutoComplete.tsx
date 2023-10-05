import {
    Field,
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    isField,
    Item,
    TableCalculation,
} from '@lightdash/common';
import { Group, Select, SelectProps, Text, Tooltip } from '@mantine/core';
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
    description?: string;
    size?: SelectProps['size'];
    selected?: boolean;
}

const FieldSelectItem = forwardRef<HTMLDivElement, ItemProps>(
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
            <div ref={ref} {...rest}>
                <Group noWrap spacing={size}>
                    <FieldIcon item={item} selected={rest.selected} />
                    <Text truncate size={size}>
                        {label}
                    </Text>
                </Group>
            </div>
        </Tooltip>
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
            {...rest}
            icon={field ? <FieldIcon item={field} /> : undefined}
            value={selectedFieldId}
            itemComponent={FieldSelectItem}
            data={sortedItems.map((i) => ({
                value: getItemId(i),
                label: isField(i)
                    ? hasGrouping
                        ? getItemLabelWithoutTableName(i)
                        : getItemLabel(i)
                    : i.name,
                description: isField(i) ? i.description : undefined,
                item: i,
                group: hasGrouping && isField(i) ? i.tableLabel : undefined,
                size: rest.size,
            }))}
            onChange={handleChange}
        />
    );
};

export default FieldAutoComplete;
