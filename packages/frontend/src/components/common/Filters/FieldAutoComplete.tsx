import { Colors, Icon, MenuItem } from '@blueprintjs/core';
import { ItemRenderer, Suggest } from '@blueprintjs/select';
import {
    fieldId as getFieldId,
    FilterableField,
    isDimension,
    isField,
    TableCalculation,
} from 'common';
import React, { FC } from 'react';
import { createGlobalStyle } from 'styled-components';

type Item = FilterableField | TableCalculation;

const FieldSuggest = Suggest.ofType<Item>();

const AutocompleteMaxHeight = createGlobalStyle`
  .autocomplete-max-height {
    max-height: 400px;
    overflow-y: auto;
  }
`;

const getItemId = (item: Item) =>
    isField(item) ? getFieldId(item) : item.name;

const renderItem: ItemRenderer<Item> = (item, { modifiers, handleClick }) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem
            active={modifiers.active}
            key={getItemId(item)}
            icon={
                <Icon
                    icon={
                        isField(item)
                            ? isDimension(item)
                                ? 'tag'
                                : 'numerical'
                            : 'function'
                    }
                    color={
                        isField(item)
                            ? isDimension(item)
                                ? Colors.BLUE1
                                : Colors.ORANGE1
                            : Colors.GREEN1
                    }
                />
            }
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
    disabled?: boolean;
    autoFocus?: boolean;
    activeField?: Item;
    fields: Array<Item>;
    onChange: (value: Item) => void;
    onClosed?: () => void;
};

const FieldAutoComplete: FC<Props> = ({
    disabled,
    autoFocus,
    activeField,
    fields,
    onChange,
    onClosed,
}) => (
    <>
        <AutocompleteMaxHeight />
        <FieldSuggest
            fill
            disabled={disabled}
            inputProps={{
                autoFocus,
                placeholder: 'Search field...',
                leftIcon: activeField && (
                    <Icon
                        icon={
                            isField(activeField)
                                ? isDimension(activeField)
                                    ? 'tag'
                                    : 'numerical'
                                : 'function'
                        }
                        color={
                            isField(activeField)
                                ? isDimension(activeField)
                                    ? Colors.BLUE1
                                    : Colors.ORANGE1
                                : Colors.GREEN1
                        }
                    />
                ),
            }}
            items={fields}
            itemsEqual={(value, other) => getItemId(value) === getItemId(other)}
            inputValueRenderer={(item: Item) => {
                if (!activeField) {
                    return '';
                }
                return isField(item)
                    ? `${item.tableLabel} ${item.label}`
                    : item.displayName;
            }}
            popoverProps={{
                minimal: true,
                onClosed,
                popoverClassName: 'autocomplete-max-height',
            }}
            itemRenderer={renderItem}
            selectedItem={activeField}
            noResults={<MenuItem disabled text="No results." />}
            onItemSelect={onChange}
            itemPredicate={(
                query: string,
                item: Item,
                index?: undefined | number,
                exactMatch?: undefined | false | true,
            ) => {
                const label = isField(item)
                    ? `${item.tableLabel} ${item.label}`
                    : item.displayName;
                if (exactMatch) {
                    return query.toLowerCase() === label.toLowerCase();
                }
                return label.toLowerCase().includes(query.toLowerCase());
            }}
        />
    </>
);

export default FieldAutoComplete;
