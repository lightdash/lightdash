import { MenuItem } from '@blueprintjs/core';
import {
    ItemRenderer,
    MultiSelect as BlueprintMultiSelect,
} from '@blueprintjs/select';
import React, { FC } from 'react';
import { ControllerRenderProps, FieldValues } from 'react-hook-form';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

type MultiselectItem =
    | string
    | {
          value: any;
          label: string;
          disabled?: boolean;
          title?: string;
      };
type MultiselectItems =
    | Array<string>
    | Array<{
          value: any;
          label: string;
          disabled?: boolean;
          title?: string;
      }>;

function isItemMatch(value: MultiselectItem, other: MultiselectItem): boolean {
    const valueId =
        typeof value === 'string' ? value.toLowerCase() : value.value;
    const otherId =
        typeof other === 'string' ? other.toLowerCase() : other.value;
    return valueId === otherId;
}

function toggleValueFromArray(
    array: MultiselectItem[],
    value: MultiselectItem,
) {
    const copy = [...array];
    const index = copy.findIndex((v) => isItemMatch(v, value));

    if (index === -1) {
        copy.push(value);
    } else {
        copy.splice(index, 1);
    }
    return copy;
}

function itemPredicate(
    query: string,
    item: MultiselectItem,
    index?: undefined | number,
    exactMatch?: undefined | false | true,
) {
    const label = typeof item === 'string' ? item : item.label;
    if (exactMatch) {
        return query.toLowerCase() === label.toLowerCase();
    }
    return label.toLowerCase().includes(query.toLowerCase());
}

const ControlledMultiSelect: FC<{
    items: MultiselectItems;
    field: ControllerRenderProps<
        FieldValues,
        string | `${string}.${string}` | `${string}.${number}`
    >;
}> = ({ items, field, ...props }) => {
    const renderItem: ItemRenderer<MultiselectItem> = (
        item,
        { modifiers, handleClick },
    ) => {
        if (!modifiers.matchesPredicate) {
            return null;
        }
        const valueId = typeof item === 'string' ? item : item.value;
        const label = typeof item === 'string' ? item : item.label;
        const isSelected = field.value?.find((value: MultiselectItem) =>
            isItemMatch(value, item),
        );
        const disabled = typeof item === 'string' ? false : item.disabled;
        const title = typeof item === 'string' ? '' : item.title;

        return (
            <MenuItem
                active={modifiers.active}
                icon={isSelected ? 'tick' : 'blank'}
                key={valueId}
                text={label}
                onClick={handleClick}
                shouldDismissPopover={false}
                disabled={disabled}
                title={title}
            />
        );
    };
    const onItemSelect = (value: MultiselectItem) => {
        const newValue = toggleValueFromArray(field.value, value);
        field.onChange(newValue);
    };
    const onRemove = (selectedValue: React.ReactNode, i: number) => {
        field.onChange(
            field.value
                .slice(0, i)
                .concat(field.value.slice(i + 1, field.value.length)),
        );
    };
    return (
        <BlueprintMultiSelect<MultiselectItem>
            fill
            items={items}
            {...props}
            {...field}
            noResults={<MenuItem disabled text="No results." />}
            itemsEqual={isItemMatch}
            selectedItems={field.value}
            itemRenderer={renderItem}
            tagRenderer={(item): string =>
                typeof item === 'string' ? item : item.label
            }
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
    items: MultiselectItems;
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
