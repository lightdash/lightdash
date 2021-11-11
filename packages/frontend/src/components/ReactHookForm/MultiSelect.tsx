import React, { FC, useRef } from 'react';
import { MenuItem } from '@blueprintjs/core';
import {
    ItemRenderer,
    MultiSelect as BlueprintMultiSelect,
} from '@blueprintjs/select';
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

interface SelectFieldProps extends Omit<InputWrapperProps, 'render'> {
    items: string[];
}

const MultiSelect: FC<SelectFieldProps> = ({ items, ...rest }) => {
    const currentValue = useRef<string[]>([]);
    const renderItem: ItemRenderer<string> = (
        name,
        { modifiers, handleClick },
    ) => {
        if (!modifiers.matchesPredicate) {
            return null;
        }
        const isSelected = currentValue.current.indexOf(name) !== -1;
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
    return (
        <InputWrapper
            {...rest}
            render={(props, { field }) => {
                currentValue.current = field.value;
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
                        onItemSelect={(value) => {
                            const newValue = toggleValueFromArray(
                                field.value,
                                value,
                            );
                            field.onChange(newValue);
                        }}
                        tagInputProps={{
                            tagProps: {
                                minimal: true,
                            },
                            onRemove: (selectedValue: React.ReactNode) => {
                                const newValue = field.value.filter(
                                    (v: string) => v !== selectedValue,
                                );
                                field.onChange(newValue);
                            },
                        }}
                        popoverProps={{ minimal: true }}
                        resetOnSelect
                        openOnKeyDown
                        itemPredicate={(
                            query: string,
                            item: string,
                            index?: undefined | number,
                            exactMatch?: undefined | false | true,
                        ) => {
                            if (exactMatch) {
                                return (
                                    query.toLowerCase() === item.toLowerCase()
                                );
                            }
                            return item
                                .toLowerCase()
                                .includes(query.toLowerCase());
                        }}
                    />
                );
            }}
        />
    );
};
export default MultiSelect;
