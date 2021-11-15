import { MenuItem } from '@blueprintjs/core';
import {
    ItemRenderer,
    MultiSelect as BlueprintMultiSelect,
} from '@blueprintjs/select';
import React, { FC } from 'react';
import { ControllerRenderProps, FieldValues } from 'react-hook-form';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

function toggleValueFromArray<T>(array: T[], value: T) {
    const copy = [...array];
    const index = copy.indexOf(value);

    if (index === -1) {
        copy.push(value);
    } else {
        copy.splice(index, 1);
    }
    return copy;
}

function itemPredicate(
    query: string,
    item: string,
    index?: undefined | number,
    exactMatch?: undefined | false | true,
) {
    if (exactMatch) {
        return query.toLowerCase() === item.toLowerCase();
    }
    return item.toLowerCase().includes(query.toLowerCase());
}

const ControlledMultiSelect: FC<{
    items: string[];
    field: ControllerRenderProps<
        FieldValues,
        string | `${string}.${string}` | `${string}.${number}`
    >;
}> = ({ items, field, ...props }) => {
    const renderItem: ItemRenderer<string> = (
        name,
        { modifiers, handleClick },
    ) => {
        if (!modifiers.matchesPredicate) {
            return null;
        }
        const isSelected = field.value.indexOf(name) !== -1;
        return (
            <MenuItem
                active={modifiers.active}
                icon={isSelected ? 'tick' : 'blank'}
                key={name}
                text={name}
                onClick={handleClick}
                shouldDismissPopover={false}
            />
        );
    };
    const onItemSelect = (value: string) => {
        const newValue = toggleValueFromArray(field.value, value);
        field.onChange(newValue);
    };
    const onRemove = (selectedValue: React.ReactNode) => {
        const newValue = field.value.filter((v: string) => v !== selectedValue);
        field.onChange(newValue);
    };
    return (
        <BlueprintMultiSelect
            fill
            items={items}
            {...props}
            {...field}
            noResults={<MenuItem disabled text="No results." />}
            itemsEqual={(value, other) =>
                value.toLowerCase() === other.toLowerCase()
            }
            selectedItems={field.value}
            itemRenderer={renderItem}
            tagRenderer={(name) => name}
            onItemSelect={onItemSelect}
            tagInputProps={{
                tagProps: {
                    minimal: true,
                },
                onRemove,
            }}
            popoverProps={{ minimal: true }}
            resetOnSelect
            itemPredicate={itemPredicate}
        />
    );
};

interface SelectFieldProps extends Omit<InputWrapperProps, 'render'> {
    items: string[];
}

const MultiSelect: FC<SelectFieldProps> = ({ items, ...rest }) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <ControlledMultiSelect field={field} items={items} {...props} />
        )}
    />
);
export default MultiSelect;
