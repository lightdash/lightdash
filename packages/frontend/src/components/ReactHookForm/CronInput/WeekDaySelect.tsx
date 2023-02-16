import { Button } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer, Select2 as BlueprintSelect2 } from '@blueprintjs/select';
import React, { FC, useCallback } from 'react';

type Option = {
    value: number;
    label: string;
};

const Options: Array<Option> = [
    {
        value: 0,
        label: 'Sunday',
    },
    {
        value: 1,
        label: 'Monday',
    },
    {
        value: 2,
        label: 'Tuesday',
    },
    {
        value: 3,
        label: 'Wednesday',
    },
    {
        value: 4,
        label: 'Thursday',
    },
    {
        value: 5,
        label: 'Friday',
    },
    {
        value: 6,
        label: 'Saturday',
    },
];

function isItemMatch(value: Option, other: Option): boolean {
    return value.value === other.value;
}

function itemPredicate(
    query: string,
    item: Option,
    index?: undefined | number,
    exactMatch?: undefined | false | true,
) {
    const label = item.label;
    if (exactMatch) {
        return query.toLowerCase() === label.toLowerCase();
    }
    return label.toLowerCase().includes(query.toLowerCase());
}

const renderItem: ItemRenderer<Option> = (item, { modifiers, handleClick }) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    const valueId = `${item.value}`;
    const label = item.label;
    return (
        <MenuItem2
            active={modifiers.active}
            selected={modifiers.active}
            disabled={modifiers.disabled}
            key={valueId}
            text={label}
            onClick={handleClick}
            shouldDismissPopover={false}
            title={label}
        />
    );
};

const WeekDaySelect: FC<{
    disabled?: boolean;
    value: number;
    onChange: (value: number) => void;
}> = ({ disabled, value, onChange }) => {
    const items = Options;
    const activeItem = items.find((item) => item.value === value);
    const onItemSelect = useCallback(
        (item: Option) => {
            onChange(item.value);
        },
        [onChange],
    );
    return (
        <BlueprintSelect2<Option>
            filterable={false}
            fill
            items={items}
            noResults={<MenuItem2 disabled text="No results." />}
            itemsEqual={isItemMatch}
            activeItem={activeItem}
            itemRenderer={renderItem}
            onItemSelect={onItemSelect}
            popoverProps={{ minimal: true }}
            itemPredicate={itemPredicate}
        >
            <Button
                className={disabled ? 'disabled-filter' : ''}
                disabled={disabled}
                rightIcon="caret-down"
                text={activeItem?.label}
                fill
                style={{
                    display: 'inline-flex',
                    justifyContent: 'space-between',
                    whiteSpace: 'nowrap',
                }}
            />
        </BlueprintSelect2>
    );
};
export default WeekDaySelect;
