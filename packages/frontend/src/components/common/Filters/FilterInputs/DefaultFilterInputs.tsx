import {
    assertUnreachable,
    ConditionalRule,
    FilterableItem,
    FilterOperator,
    FilterType,
    isFilterRule,
} from '@lightdash/common';
import { Box, MultiSelect, NumberInput, PopoverProps } from '@mantine/core';
import { uniq } from 'lodash-es';
import isString from 'lodash-es/isString';
import React from 'react';
import { useFiltersContext } from '../FiltersProvider';
import MultiAutoComplete from './AutoComplete/MultiAutoComplete';

export type FilterInputsProps<T extends ConditionalRule> = {
    filterType: FilterType;
    field: FilterableItem;
    rule: T;
    onChange: (value: T) => void;
    popoverProps?: Pick<PopoverProps, 'onOpen' | 'onClose'>;
    disabled?: boolean;
};

const DefaultFilterInputs = <T extends ConditionalRule>({
    field,
    filterType,
    rule,
    popoverProps,
    disabled,
    onChange,
}: React.PropsWithChildren<FilterInputsProps<T>>) => {
    const { getField } = useFiltersContext();
    const suggestions = isFilterRule(rule)
        ? getField(rule)?.suggestions
        : undefined;

    switch (rule.operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return <Box sx={{ flex: 1 }} />;
        case FilterOperator.STARTS_WITH:
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE:
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS: {
            if (filterType === FilterType.STRING) {
                return (
                    <MultiAutoComplete
                        disabled={disabled}
                        field={field}
                        values={(rule.values || []).filter(isString)}
                        suggestions={suggestions || []}
                        popoverProps={popoverProps}
                        onChange={(values) =>
                            onChange({
                                ...rule,
                                values,
                            })
                        }
                    />
                );
            }

            const values =
                rule.values?.map((v) => ({
                    value: String(v),
                    label: String(v),
                    originalValue: v,
                })) || [];

            const currentValue = values.map((v) => v.value);

            const handleChange = (newValues: string[]) => {
                onChange({ ...rule, values: uniq(newValues.filter(Boolean)) });
            };

            return (
                <MultiSelect
                    sx={{
                        flex: 1,
                        // TODO: extract this elsewhere
                        'input::-webkit-outer-spin-button, input::-webkit-inner-spin-button':
                            {
                                appearance: 'none',
                                margin: 0,
                                "input[type='number']": {
                                    appearance: 'textfield',
                                },
                            },
                    }}
                    type={
                        filterType === FilterType.NUMBER ? 'number' : 'search'
                    }
                    searchable
                    creatable
                    clearSearchOnChange
                    clearSearchOnBlur
                    getCreateLabel={(query) => `+ add "${query}"`}
                    disabled={disabled}
                    data={values}
                    placeholder={`Enter a ${filterType}`}
                    value={currentValue}
                    onChange={handleChange}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    onCreate={(query) => {
                        handleChange([...currentValue, query]);
                        return query;
                    }}
                    onBlur={(e) => {
                        handleChange([...currentValue, e.currentTarget.value]);
                    }}
                />
            );
        }
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.IN_BETWEEN:
            const value = rule.values?.[0];
            let parsedValue: number | undefined;

            if (typeof value === 'string') parsedValue = parseInt(value, 10);
            else if (typeof value === 'number') parsedValue = value;
            else parsedValue = undefined;

            if (parsedValue && isNaN(parsedValue)) parsedValue = undefined;

            return (
                <NumberInput
                    sx={{ flex: 1 }}
                    disabled={disabled}
                    type="number"
                    placeholder="Enter a number"
                    defaultValue={parsedValue}
                    onChange={(numberValue) => {
                        onChange({
                            ...rule,
                            values: numberValue ? [] : [numberValue],
                        });
                    }}
                />
            );
        default:
            return assertUnreachable(
                rule.operator,
                `No form implemented for String filter operator ${rule.operator}`,
            );
    }
};

export default DefaultFilterInputs;
