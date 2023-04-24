import {
    Field,
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    isField,
    TableCalculation,
} from '@lightdash/common';
import { Group, Select, SelectItemProps, Text } from '@mantine/core';
import { forwardRef, useMemo } from 'react';
import FieldIcon from './FieldIcon';

type FieldAutoCompleteProps<T> = {
    id?: string;
    name?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    activeField?: T;
    placeholder?: string;
    fields: T[];
    onChange: (value: T) => void;
    onClosed?: () => void;
    hasGrouping?: boolean;
};

type ItemProps = SelectItemProps & {
    value: string;
    label: string;
    item: Field | TableCalculation;
};

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ label, item, ...others }: ItemProps, ref) => (
        <Group noWrap ref={ref} {...others}>
            <FieldIcon item={item} />
            <Text>{label}</Text>
        </Group>
    ),
);

const FieldAutoComplete = <T extends Field | TableCalculation>({
    id,
    name,
    disabled,
    autoFocus,
    placeholder,
    activeField,
    fields,
    hasGrouping = true,
    onChange,
    onClosed,
}: FieldAutoCompleteProps<T>) => {
    const itemData = useMemo(() => {
        return fields
            .sort((a, b) => getItemLabel(a).localeCompare(getItemLabel(b)))
            .map<ItemProps>((field) => ({
                item: field,
                value: getItemId(field),
                label: hasGrouping
                    ? getItemLabelWithoutTableName(field)
                    : getItemLabel(field),
                group:
                    hasGrouping && isField(field)
                        ? field.table.toUpperCase()
                        : undefined,
            }));
    }, [hasGrouping, fields]);

    return (
        <Select
            // input props
            id={id}
            name={name}
            disabled={disabled}
            autoFocus={autoFocus}
            placeholder={placeholder || 'Search field...'}
            // component props
            searchable
            nothingFound="No results."
            data={itemData}
            value={activeField && getItemId(activeField)}
            itemComponent={SelectItem}
            icon={activeField && <FieldIcon item={activeField} />}
            // events
            onChange={(value) => {
                const field = fields.find((f) => getItemId(f) === value);
                if (field) onChange(field);
            }}
            onDropdownClose={onClosed}
        />
    );
};

export default FieldAutoComplete;
