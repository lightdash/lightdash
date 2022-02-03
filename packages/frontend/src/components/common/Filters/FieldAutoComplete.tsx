import { Colors, Icon, MenuItem } from '@blueprintjs/core';
import { ItemRenderer, Suggest } from '@blueprintjs/select';
import { Field, fieldId as getFieldId, isDimension } from 'common';
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
    activeField?: Field;
    fields: Field[];
    onChange: (value: Field) => void;
    onClosed?: () => void;
};

const FieldAutoComplete: FC<Props> = ({
    autoFocus,
    activeField,
    fields,
    onChange,
    onClosed,
}) => (
    <FieldSuggest
        inputProps={{
            autoFocus,
            placeholder: 'Search field...',
            style: { width: 250 },
            leftIcon: activeField && (
                <Icon
                    icon={isDimension(activeField) ? 'tag' : 'numerical'}
                    color={
                        isDimension(activeField) ? Colors.BLUE1 : Colors.ORANGE1
                    }
                />
            ),
        }}
        items={fields}
        itemsEqual={(value, other) => getFieldId(value) === getFieldId(other)}
        inputValueRenderer={(field: Field) =>
            `${field.tableLabel} ${field.label}`
        }
        popoverProps={{ minimal: true, onClosed }}
        itemRenderer={renderItem}
        selectedItem={activeField}
        noResults={<MenuItem disabled text="No results." />}
        onItemSelect={onChange}
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
