import { Button } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer, Select2 as BlueprintSelect2 } from '@blueprintjs/select';
import React, { FC, useCallback } from 'react';
import { Frequency } from './cronInputUtils';

type FrequencyItem = {
    value: Frequency;
    label: string;
};

const FrequencyItems: Array<FrequencyItem> = [
    {
        value: Frequency.HOURLY,
        label: 'Hourly',
    },
    {
        value: Frequency.DAILY,
        label: 'Daily',
    },
    {
        value: Frequency.WEEKLY,
        label: 'Weekly',
    },
    {
        value: Frequency.MONTHLY,
        label: 'Monthly',
    },
    {
        value: Frequency.CUSTOM,
        label: 'Custom',
    },
];

function isItemMatch(value: FrequencyItem, other: FrequencyItem): boolean {
    return value.value === other.value;
}

function itemPredicate(
    query: string,
    item: FrequencyItem,
    index?: undefined | number,
    exactMatch?: undefined | false | true,
) {
    const label = item.label;
    if (exactMatch) {
        return query.toLowerCase() === label.toLowerCase();
    }
    return label.toLowerCase().includes(query.toLowerCase());
}

const renderItem: ItemRenderer<FrequencyItem> = (
    item,
    { modifiers, handleClick },
) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    const valueId = `${item.value}`;
    const label = item.label;
    return (
        <MenuItem2
            selected={modifiers.active}
            disabled={modifiers.disabled}
            icon={modifiers.active ? 'tick' : 'blank'}
            key={valueId}
            text={label}
            onClick={handleClick}
            shouldDismissPopover={false}
            title={label}
        />
    );
};

const FrequencySelect: FC<{
    disabled?: boolean;
    value: Frequency;
    onChange: (value: Frequency) => void;
}> = ({ disabled, value, onChange }) => {
    const items = FrequencyItems;
    const activeItem = items.find((item) => item.value === value);
    const onItemSelect = useCallback(
        (item: FrequencyItem) => {
            onChange(item.value);
        },
        [onChange],
    );
    return (
        <BlueprintSelect2<FrequencyItem>
            filterable={false}
            fill
            items={items}
            noResults={<MenuItem2 disabled text="No results." />}
            itemsEqual={isItemMatch}
            activeItem={activeItem}
            itemRenderer={renderItem}
            onItemSelect={onItemSelect}
            popoverProps={{ minimal: true, matchTargetWidth: true }}
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
export default FrequencySelect;
