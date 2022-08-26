import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer, MultiSelect } from '@blueprintjs/select';
import React, { FC, useCallback } from 'react';

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
        return query === item;
    }
    return item.toLowerCase().includes(query.toLowerCase());
}

type Props = {
    values: string[];
    suggestions: string[];
    onChange: (values: string[]) => void;
};

const StringMultiSelect: FC<Props> = ({ values, suggestions, onChange }) => {
    const renderItem: ItemRenderer<string> = useCallback(
        (name, { modifiers, handleClick }) => {
            if (!modifiers.matchesPredicate) {
                return null;
            }
            return (
                <MenuItem2
                    active={modifiers.active}
                    icon={values.includes(name) ? 'tick' : 'blank'}
                    key={name}
                    text={name}
                    onClick={handleClick}
                    shouldDismissPopover={false}
                />
            );
        },
        [values],
    );
    const renderCreateOption = useCallback(
        (
            query: string,
            active: boolean,
            handleClick: React.MouseEventHandler<HTMLElement>,
        ) => (
            <MenuItem2
                icon="add"
                text={`Add "${query}"`}
                active={active}
                onClick={handleClick}
                shouldDismissPopover={false}
            />
        ),
        [],
    );
    const onItemSelect = useCallback(
        (value: string) => {
            onChange(toggleValueFromArray(values, value));
        },
        [onChange, values],
    );
    const onRemove = useCallback(
        (selectedValue: React.ReactNode) => {
            onChange(values.filter((v: string) => v !== selectedValue));
        },
        [onChange, values],
    );
    return (
        <MultiSelect
            fill
            items={Array.from(new Set([...suggestions, ...values]))}
            noResults={<MenuItem2 disabled text="No suggestions." />}
            itemsEqual={(value, other) =>
                value.toLowerCase() === other.toLowerCase()
            }
            selectedItems={values}
            itemRenderer={renderItem}
            tagRenderer={(name) => name}
            onItemSelect={onItemSelect}
            tagInputProps={{
                placeholder: undefined,
                tagProps: {
                    minimal: true,
                },
                onRemove,
            }}
            popoverProps={{ minimal: true }}
            resetOnSelect
            itemPredicate={itemPredicate}
            createNewItemRenderer={renderCreateOption}
            createNewItemFromQuery={(name: string) => name}
        />
    );
};

export default StringMultiSelect;
