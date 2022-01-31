import { MenuItem } from '@blueprintjs/core';
import { ItemRenderer, Suggest } from '@blueprintjs/select';
import { Field, fieldId as getFieldId } from 'common';
import React, { FC } from 'react';

const FieldSuggest = Suggest.ofType<Field>();

const renderItem: ItemRenderer<Field> = (field, { modifiers, handleClick }) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem
            active={modifiers.active}
            key={getFieldId(field)}
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
    activeField: Field;
    fields: Field[];
    onChange: (value: string) => void;
};

const FieldAutoComplete: FC<Props> = ({ activeField, fields, onChange }) => (
    <FieldSuggest
        inputProps={{ style: { width: 250 } }}
        items={fields}
        itemsEqual={(value, other) => getFieldId(value) === getFieldId(other)}
        inputValueRenderer={(field: Field) =>
            `${field.tableLabel} ${field.label}`
        }
        itemRenderer={renderItem}
        selectedItem={activeField}
        noResults={<MenuItem disabled text="No results." />}
        onItemSelect={(field: Field) => {
            onChange(getFieldId(field));
        }}
        itemPredicate={(
            query: string,
            field: Field,
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
);

export default FieldAutoComplete;
