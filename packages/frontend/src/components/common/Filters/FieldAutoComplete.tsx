import { Icon } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer, Suggest2 } from '@blueprintjs/select';
import {
    Field,
    getItemColor,
    getItemIcon,
    getItemId,
    getItemLabel,
    isField,
    TableCalculation,
} from '@lightdash/common';
import React, { FC } from 'react';
import { createGlobalStyle } from 'styled-components';

type Item = Field | TableCalculation;

const FieldSuggest = Suggest2.ofType<Item>();

const AutocompleteMaxHeight = createGlobalStyle`
  .autocomplete-max-height {
    max-height: 400px;
    overflow-y: auto;
  }
`;

const renderItem: ItemRenderer<Item> = (item, { modifiers, handleClick }) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem2
            active={modifiers.active}
            key={getItemId(item)}
            icon={<Icon icon={getItemIcon(item)} color={getItemColor(item)} />}
            text={
                <span>
                    {isField(item) ? `${item.tableLabel} ` : ''}
                    <b>{isField(item) ? item.label : item.displayName}</b>
                </span>
            }
            onClick={handleClick}
            shouldDismissPopover={false}
        />
    );
};

type Props = {
    id?: string;
    name?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    activeField?: Item;
    placeholder?: string;
    fields: Array<Item>;
    onChange: (value: Item) => void;
    onClosed?: () => void;
};

const FieldAutoComplete: FC<Props> = ({
    disabled,
    autoFocus,
    activeField,
    fields,
    id,
    name,
    onChange,
    onClosed,
    placeholder,
}) => (
    <>
        <AutocompleteMaxHeight />
        <FieldSuggest
            fill
            disabled={disabled}
            inputProps={{
                id,
                name,
                autoFocus,
                placeholder: placeholder || 'Search field...',
                leftIcon: activeField && (
                    <Icon
                        icon={getItemIcon(activeField)}
                        color={getItemColor(activeField)}
                    />
                ),
            }}
            items={fields}
            itemsEqual={(value, other) => {
                return getItemId(value) === getItemId(other);
            }}
            inputValueRenderer={(item: Item) => {
                if (!activeField) {
                    return '';
                }
                return getItemLabel(item);
            }}
            popoverProps={{
                minimal: true,
                onClosed,
                popoverClassName: 'autocomplete-max-height',
                captureDismiss: true,
            }}
            itemRenderer={renderItem}
            activeItem={activeField}
            selectedItem={activeField}
            noResults={<MenuItem2 disabled text="No results." />}
            onItemSelect={onChange}
            itemPredicate={(
                query: string,
                item: Item,
                index?: undefined | number,
                exactMatch?: undefined | false | true,
            ) => {
                const label = getItemLabel(item);
                if (exactMatch) {
                    return query.toLowerCase() === label.toLowerCase();
                }
                return label.toLowerCase().includes(query.toLowerCase());
            }}
        />
    </>
);

export default FieldAutoComplete;
