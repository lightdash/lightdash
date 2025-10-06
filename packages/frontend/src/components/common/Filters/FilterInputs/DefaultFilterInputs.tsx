import {
    FilterOperator,
    FilterType,
    assertUnreachable,
    isFilterRule,
    isTableCalculation,
    type BaseFilterRule,
} from '@lightdash/common';
import isString from 'lodash/isString';
import { type FilterInputsProps } from '.';
import { TagInput } from '../../TagInput/TagInput';
import useFiltersContext from '../useFiltersContext';
import { getPlaceholderByFilterTypeAndOperator } from '../utils/getPlaceholderByFilterTypeAndOperator';
import FilterMultiStringInput from './FilterMultiStringInput';
import FilterNumberInput from './FilterNumberInput';
import FilterNumberRangeInput from './FilterNumberRangeInput';
import FilterStringAutoComplete from './FilterStringAutoComplete';

const DefaultFilterInputs = <T extends BaseFilterRule>({
    field,
    filterType,
    rule,
    disabled,
    onChange,
    popoverProps,
}: FilterInputsProps<T>) => {
    const { getField } = useFiltersContext();
    const suggestions = isFilterRule(rule)
        ? getField(rule)?.suggestions
        : undefined;

    const isFilterRuleDisabled = isFilterRule(rule) && rule.disabled;

    // Check if the filter should only allow a single value
    const isSingleValue =
        isFilterRule(rule) && 'singleValue' in rule && !!rule.singleValue;

    const placeholder = getPlaceholderByFilterTypeAndOperator({
        type: filterType,
        operator: rule.operator,
        disabled: isFilterRuleDisabled,
        singleValue: isSingleValue,
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
                    return !field || isTableCalculation(field) ? (
                        <FilterMultiStringInput
                            disabled={disabled}
                            placeholder={placeholder}
                            autoFocus={true}
                            withinPortal={popoverProps?.withinPortal}
                            onDropdownOpen={popoverProps?.onOpen}
                            onDropdownClose={popoverProps?.onClose}
                            values={(rule.values || []).filter(isString)}
                            onChange={(values) =>
                                onChange({
                                    ...rule,
                                    values,
                                })
                            }
                        />
                    ) : (
                        <FilterStringAutoComplete
                            filterId={rule.id}
                            disabled={disabled}
                            field={field}
                            autoFocus={true}
                            placeholder={placeholder}
                            suggestions={suggestions || []}
                            withinPortal={popoverProps?.withinPortal}
                            onDropdownOpen={popoverProps?.onOpen}
                            onDropdownClose={popoverProps?.onClose}
                            values={(rule.values || []).filter(isString)}
                            singleValue={isSingleValue}
                            onChange={(values) =>
                                onChange({
                                    ...rule,
                                    values,
                                })
                            }
                        />
                    );

                case FilterType.NUMBER:
                    if (isSingleValue) {
                        if (rule.values?.length && rule.values.length > 1) {
                            onChange({
                                ...rule,
                                values: [rule.values[0]],
                            });
                        }
                        return (
                            <FilterNumberInput
                                disabled={disabled}
                                autoFocus={true}
                                placeholder={placeholder}
                                value={rule.values?.[0]}
                                onChange={(newValue) => {
                                    onChange({
                                        ...rule,
                                        values:
                                            newValue !== null ? [newValue] : [],
                                    });
                                }}
                            />
                        );
                    } else {
                        return (
                            <TagInput
                                w="100%"
                                clearable
                                autoFocus={true}
                                size="xs"
                                disabled={disabled}
                                placeholder={placeholder}
                                allowDuplicates={false}
                                validationRegex={/^-?\d+(\.\d+)?$/}
                                value={rule.values?.map(String)}
                                onChange={(values) =>
                                    onChange({ ...rule, values })
                                }
                            />
                        );
                    }
                case FilterType.BOOLEAN:
                case FilterType.DATE:
                    return (
                        <TagInput
                            w="100%"
                            clearable
                            autoFocus={true}
                            size="xs"
                            disabled={disabled}
                            placeholder={placeholder}
                            allowDuplicates={false}
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
        case FilterOperator.NOT_IN_THE_CURRENT:
            return (
                <FilterNumberInput
                    disabled={disabled}
                    autoFocus={true}
                    placeholder={placeholder}
                    value={rule.values?.[0]}
                    onChange={(newValue) => {
                        onChange({
                            ...rule,
                            values: newValue !== null ? [newValue] : [],
                        });
                    }}
                />
            );
        case FilterOperator.IN_BETWEEN:
        case FilterOperator.NOT_IN_BETWEEN:
            return (
                <FilterNumberRangeInput
                    disabled={disabled}
                    autoFocus={true}
                    placeholder={placeholder}
                    value={rule.values}
                    onChange={(value) => {
                        onChange({
                            ...rule,
                            values: value,
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
