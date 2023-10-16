import { Popover2Props } from '@blueprintjs/popover2';
import {
    assertUnreachable,
    ConditionalRule,
    FilterableItem,
    FilterOperator,
    FilterType,
    isFilterRule,
} from '@lightdash/common';
import { NumberInput } from '@mantine/core';
import isString from 'lodash-es/isString';
import React from 'react';
import { TagInput } from '../../TagInput/TagInput';
import { useFiltersContext } from '../FiltersProvider';
import { getPlaceholderByFilterTypeAndOperator } from '../utils/getPlaceholderByFilterTypeAndOperator';
import MultiAutoComplete from './AutoComplete/MultiAutoComplete';

export type FilterInputsProps<T extends ConditionalRule> = {
    filterType: FilterType;
    field: FilterableItem;
    rule: T;
    onChange: (value: T) => void;
    disabled?: boolean;
    popoverProps?: Popover2Props;
};

const DefaultFilterInputs = <T extends ConditionalRule>({
    field,
    filterType,
    rule,
    disabled,
    popoverProps,
    onChange,
}: React.PropsWithChildren<FilterInputsProps<T>>) => {
    const { getField } = useFiltersContext();
    const suggestions = isFilterRule(rule)
        ? getField(rule)?.suggestions
        : undefined;

    const placeholder = getPlaceholderByFilterTypeAndOperator({
        type: filterType,
        operator: rule.operator,
        disabled: isFilterRule(rule)
            ? rule.disabled && !rule.values
            : undefined,
    });

    switch (rule.operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return <span style={{ width: '100%' }} />;
        case FilterOperator.STARTS_WITH:
        case FilterOperator.ENDS_WITH:
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE:
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS: {
            switch (filterType) {
                case FilterType.STRING:
                    return (
                        <MultiAutoComplete
                            filterId={rule.id}
                            disabled={disabled}
                            field={field}
                            placeholder={placeholder}
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

                case FilterType.NUMBER:
                case FilterType.BOOLEAN:
                case FilterType.DATE:
                    return (
                        <TagInput
                            w="100%"
                            clearable
                            size="xs"
                            disabled={disabled}
                            placeholder={placeholder}
                            allowDuplicates={false}
                            validationRegex={
                                filterType === FilterType.NUMBER
                                    ? /^-?\d+(\.\d+)?$/
                                    : undefined
                            }
                            value={rule.values?.map(String)}
                            onChange={(values) => onChange({ ...rule, values })}
                        />
                    );
                default:
                    return assertUnreachable(
                        filterType,
                        `No form implemented for DefaultFilterInputs filter type ${filterType}`,
                    );
            }
        }
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
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
                    disabled={disabled}
                    w="100%"
                    size="xs"
                    placeholder={placeholder}
                    value={parsedValue}
                    onChange={(newValue) => {
                        onChange({
                            ...rule,
                            values: newValue === '' ? [] : [newValue],
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
