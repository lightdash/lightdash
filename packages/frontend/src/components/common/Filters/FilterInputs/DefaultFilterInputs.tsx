import { NumericInput, TagInput } from '@blueprintjs/core';
import { Popover2Props } from '@blueprintjs/popover2';
import {
    FilterableField,
    FilterOperator,
    FilterRule,
    FilterType,
} from '@lightdash/common';
import { isString } from 'lodash-es';
import React, { FC } from 'react';
import { useFiltersContext } from '../FiltersProvider';
import MultiAutoComplete from './AutoComplete/MultiAutoComplete';

export type FilterInputsProps<T extends FilterRule = FilterRule> = {
    filterType: FilterType;
    field: FilterableField;
    filterRule: T;
    onChange: (value: FilterRule) => void;
    popoverProps?: Popover2Props;
    disabled?: boolean;
};

const DefaultFilterInputs: FC<FilterInputsProps> = ({
    field,
    filterType,
    filterRule,
    popoverProps,
    disabled,
    onChange,
}) => {
    const { getField } = useFiltersContext();
    const suggestions = getField(filterRule)?.suggestions;
    const filterOperator = filterRule.operator;
    switch (filterRule.operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return <span style={{ width: '100%' }} />;
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
                        values={(filterRule.values || []).filter(isString)}
                        suggestions={suggestions || []}
                        popoverProps={popoverProps}
                        onChange={(values) =>
                            onChange({
                                ...filterRule,
                                values,
                            })
                        }
                    />
                );
            }
            return (
                <TagInput
                    className={disabled ? 'disabled-filter' : ''}
                    fill
                    disabled={disabled}
                    addOnBlur
                    inputProps={{
                        type:
                            filterType === FilterType.NUMBER
                                ? 'number'
                                : 'text',
                    }}
                    tagProps={{ minimal: true }}
                    values={filterRule.values || []}
                    onChange={(values) =>
                        onChange({
                            ...filterRule,
                            values,
                        })
                    }
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
            const parsedValue = parseInt(filterRule.values?.[0], 10);
            return (
                <NumericInput
                    className={disabled ? 'disabled-filter' : ''}
                    disabled={disabled}
                    fill
                    value={isNaN(parsedValue) ? undefined : parsedValue}
                    min={0}
                    onValueChange={(value) =>
                        onChange({
                            ...filterRule,
                            values: [value],
                        })
                    }
                />
            );
        default: {
            const never: never = filterRule.operator;
            throw Error(
                `No form implemented for String filter operator ${filterOperator}`,
            );
        }
    }
};

export default DefaultFilterInputs;
