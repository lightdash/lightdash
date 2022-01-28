import { Button, HTMLSelect, MenuItem } from '@blueprintjs/core';
import { ItemRenderer, Suggest } from '@blueprintjs/select';
import {
    booleanFilterOptions,
    DimensionType,
    fieldId as getFieldId,
    FilterableDimension,
    FilterOperator,
    FilterRule,
    numberFilterOptions,
    stringFilterOptions,
    timeFilterOptions,
} from 'common';
import React, { FC } from 'react';
import BooleanFilterInputs from './FilterInputs/BooleanFilterInputs';
import DateFilterInputs from './FilterInputs/DateFilterInputs';
import DefaultFilterInputs, {
    FilterInputsProps,
} from './FilterInputs/DefaultFilterInputs';

const FieldSuggest = Suggest.ofType<FilterableDimension>();

type Props = {
    fields: FilterableDimension[];
    filterRule: FilterRule;
    onChange: (value: FilterRule) => void;
    onDelete: () => void;
};

const typeOperatorOptions: Record<
    FilterableDimension['type'],
    Array<{ value: FilterOperator; label: string }>
> = {
    [DimensionType.STRING]: stringFilterOptions,
    [DimensionType.NUMBER]: numberFilterOptions,
    [DimensionType.DATE]: timeFilterOptions,
    [DimensionType.TIMESTAMP]: timeFilterOptions,
    [DimensionType.BOOLEAN]: booleanFilterOptions,
};

const TypeInputs: Record<FilterableDimension['type'], FC<FilterInputsProps>> = {
    [DimensionType.STRING]: DefaultFilterInputs,
    [DimensionType.NUMBER]: DefaultFilterInputs,
    [DimensionType.DATE]: DateFilterInputs,
    [DimensionType.TIMESTAMP]: DateFilterInputs,
    [DimensionType.BOOLEAN]: BooleanFilterInputs,
};

const FilterRuleForm: FC<Props> = ({
    fields,
    filterRule,
    onChange,
    onDelete,
}) => {
    const activeField =
        fields.find(
            (field) => getFieldId(field) === filterRule.target.fieldId,
        ) || fields[0];
    const selectOptions = fields.map((dim) => ({
        value: getFieldId(dim),
        label: `${dim.tableLabel} ${dim.label}`,
    }));

    const InputsElement = TypeInputs[activeField.type];

    const onFieldChange = (fieldId: string) => {
        const selectedField = fields.find(
            (field) => getFieldId(field) === fieldId,
        );
        if (selectedField) {
            if (selectedField.type === activeField.type) {
                onChange({
                    ...filterRule,
                    target: {
                        fieldId,
                    },
                });
            } else {
                onChange({
                    ...filterRule,
                    target: {
                        fieldId,
                    },
                    operator: FilterOperator.NULL,
                    settings: undefined,
                    values: undefined,
                });
            }
        }
    };

    const renderItem: ItemRenderer<FilterableDimension> = (
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
                text={`${field.tableLabel} ${field.label}`}
                onClick={handleClick}
                shouldDismissPopover={false}
            />
        );
    };

    return (
        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <FieldSuggest
                inputProps={{}}
                items={fields}
                itemsEqual={(value, other) =>
                    getFieldId(value) === getFieldId(other)
                }
                inputValueRenderer={(field: FilterableDimension) =>
                    `${field.tableLabel} ${field.label}`
                }
                itemRenderer={renderItem}
                selectedItem={activeField}
                noResults={<MenuItem disabled text="No results." />}
                onItemSelect={(field: FilterableDimension) => {
                    onFieldChange(getFieldId(field));
                }}
                itemPredicate={(
                    query: string,
                    field: FilterableDimension,
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
            <HTMLSelect
                fill={false}
                style={{ width: 150 }}
                minimal
                onChange={(e) =>
                    onChange({
                        ...filterRule,
                        operator: e.currentTarget
                            .value as FilterRule['operator'],
                    })
                }
                options={typeOperatorOptions[activeField.type]}
                value={filterRule.operator}
            />
            <InputsElement
                field={activeField}
                filterRule={filterRule}
                onChange={onChange}
            />
            <Button minimal icon="cross" intent="danger" onClick={onDelete} />
        </div>
    );
};

export default FilterRuleForm;
