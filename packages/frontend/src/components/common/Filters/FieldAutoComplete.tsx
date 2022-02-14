import { Colors, Icon, MenuItem } from '@blueprintjs/core';
import { ItemRenderer, Suggest } from '@blueprintjs/select';
import { fieldId as getFieldId, FilterableField, isDimension } from 'common';
import React, { FC } from 'react';
import { createGlobalStyle } from 'styled-components';

const FieldSuggest = Suggest.ofType<FilterableField>();

const AutocompleteMaxHeight = createGlobalStyle`
    .autocomplete-max-height {
        max-height: 400px;
        overflow-y: auto;
    }
`;

const renderItem: ItemRenderer<FilterableField> = (
    field,
    { modifiers, handleClick },
) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem
            active={modifiers.active}
            key={getFieldId(field)}
            icon={
                <Icon
                    icon={isDimension(field) ? 'tag' : 'numerical'}
                    color={isDimension(field) ? Colors.BLUE1 : Colors.ORANGE1}
                />
            }
            text={
                <span>
                    {field.tableLabel} <b>{field.label}</b>
                </span>
            }
            onClick={handleClick}
            shouldDismissPopover={false}
        />
    );
};

type Props = {
    autoFocus?: boolean;
    activeField?: FilterableField;
    fields: FilterableField[];
    onChange: (value: FilterableField) => void;
    onClosed?: () => void;
};

const FieldAutoComplete: FC<Props> = ({
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
            inputProps={{
                autoFocus,
                placeholder: 'Search field...',
                leftIcon: activeField && (
                    <Icon
                        icon={isDimension(activeField) ? 'tag' : 'numerical'}
                        color={
                            isDimension(activeField)
                                ? Colors.BLUE1
                                : Colors.ORANGE1
                        }
                    />
                ),
            }}
            items={fields}
            itemsEqual={(value, other) =>
                getFieldId(value) === getFieldId(other)
            }
            inputValueRenderer={(field: FilterableField) =>
                `${field.tableLabel} ${field.label}`
            }
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
                field: FilterableField,
                index?: undefined | number,
                exactMatch?: undefined | false | true,
            ) => {
                if (exactMatch) {
                    return (
                        query.toLowerCase() ===
                        `${field.tableLabel} ${field.label}`.toLowerCase()
                    );
                }
                return `${field.tableLabel} ${field.label}`
                    .toLowerCase()
                    .includes(query.toLowerCase());
            }}
        />
    </>
);

export default FieldAutoComplete;
