import { NumericInput, TagInput } from '@blueprintjs/core';
import { Popover2Props } from '@blueprintjs/popover2';
import {
    assertUnreachable,
    ConditionalRule,
    FilterableField,
    FilterOperator,
    FilterType,
    isFilterRule,
} from '@lightdash/common';
import { isString } from 'lodash-es';
import React from 'react';
import { useFiltersContext } from '../FiltersProvider';
import MultiAutoComplete from './AutoComplete/MultiAutoComplete';

export type FilterInputsProps<T extends ConditionalRule> = {
    filterType: FilterType;
    field: FilterableField;
    rule: T;
    onChange: (value: T) => void;
    popoverProps?: Popover2Props;
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
                    values={rule.values || []}
                    onChange={(values) =>
                        onChange({
                            ...rule,
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
        case FilterOperator.IN_BETWEEN:
            const parsedValue = parseInt(rule.values?.[0] as string, 10);
            return (
                <NumericInput
                    className={disabled ? 'disabled-filter' : ''}
                    disabled={disabled}
                    fill
                    value={isNaN(parsedValue) ? '' : parsedValue}
                    onValueChange={(value) => {
                        const normalizedValue = isNaN(value)
                            ? undefined
                            : value;

                        onChange({
                            ...rule,
                            values: [normalizedValue],
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
