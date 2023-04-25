import {
    Field,
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    isField,
    TableCalculation,
} from '@lightdash/common';
import {
    Box,
    Flex,
    Group,
    PopoverProps,
    Select,
    SelectItemProps,
    SelectProps,
    Text,
} from '@mantine/core';
import { forwardRef, useMemo } from 'react';
import FieldIcon from './FieldIcon';

type FieldAutoCompleteProps<T> = Omit<SelectProps, 'onChange' | 'data'> & {
    activeField?: T;
    placeholder?: string;
    fields: T[];
    onChange: (value: T) => void;
    onClosed?: () => void;
    hasGrouping?: boolean;
    popoverProps?: Pick<PopoverProps, 'onOpen' | 'onClose'>;
};

type ItemProps = SelectItemProps & {
    value: string;
    label: string;
    item: Field | TableCalculation;
};

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ label, item, ...rest }: ItemProps, ref) => (
        <Flex ref={ref} wrap="nowrap" align="center" gap="xs" {...rest}>
            <FieldIcon item={item} style={{ flexShrink: 0 }} />
            <Text>{label}</Text>
        </Flex>
    ),
);

const FieldAutoComplete = <T extends Field | TableCalculation>({
    placeholder,
    activeField,
    fields,
    hasGrouping = true,
    popoverProps,
    onChange,
    onClosed,
    ...rest
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
            {...rest}
            placeholder={placeholder || 'Search field...'}
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
            onDropdownOpen={popoverProps?.onOpen}
            onDropdownClose={() => {
                onClosed?.();
                popoverProps?.onClose?.();
            }}
        />
    );
};

export default FieldAutoComplete;
