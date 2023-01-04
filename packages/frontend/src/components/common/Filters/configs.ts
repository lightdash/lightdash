import {
    DimensionType,
    FilterableField,
    FilterOperator,
    FilterRule,
    FilterType,
    formatBoolean,
    formatDate,
    formatTimestamp,
    getFilterTypeFromField,
    isDimension,
} from '@lightdash/common';
import { FC } from 'react';
import BooleanFilterInputs from './FilterInputs/BooleanFilterInputs';
import DateFilterInputs from './FilterInputs/DateFilterInputs';
import DefaultFilterInputs, {
    FilterInputsProps,
} from './FilterInputs/DefaultFilterInputs';

export const filterOperatorLabel: Record<FilterOperator, string> = {
    [FilterOperator.NULL]: 'is null',
    [FilterOperator.NOT_NULL]: 'is not null',
    [FilterOperator.EQUALS]: 'is equal to',
    [FilterOperator.NOT_EQUALS]: 'is not equal to',
    [FilterOperator.STARTS_WITH]: 'starts with',
    [FilterOperator.NOT_INCLUDE]: 'does not include',
    [FilterOperator.INCLUDE]: 'includes',
    [FilterOperator.LESS_THAN]: 'is less than',
    [FilterOperator.LESS_THAN_OR_EQUAL]: 'is less than or equal',
    [FilterOperator.GREATER_THAN]: 'is greater than',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: 'is greater than or equal',
    [FilterOperator.IN_THE_PAST]: 'in the last',
    [FilterOperator.IN_THE_CURRENT]: 'in the current',
};

const getFilterOptions = <T extends FilterOperator>(
    operators: Array<T>,
): Array<{ value: T; label: string }> =>
    operators.map((operator) => ({
        value: operator,
        label: filterOperatorLabel[operator],
    }));

const timeFilterOptions: Array<{
    value: FilterOperator;
    label: string;
}> = [
    ...getFilterOptions([
        FilterOperator.NULL,
        FilterOperator.NOT_NULL,
        FilterOperator.EQUALS,
        FilterOperator.NOT_EQUALS,
        FilterOperator.IN_THE_PAST,
        FilterOperator.IN_THE_CURRENT,
    ]),
    { value: FilterOperator.LESS_THAN, label: 'is before' },
    { value: FilterOperator.LESS_THAN_OR_EQUAL, label: 'is on or before' },
    { value: FilterOperator.GREATER_THAN, label: 'is after' },
    { value: FilterOperator.GREATER_THAN_OR_EQUAL, label: 'is on or after' },
];

export const FilterTypeConfig: Record<
    FilterType,
    {
        operatorOptions: Array<{ value: FilterOperator; label: string }>;
        inputs: FC<FilterInputsProps>;
    }
> = {
    [FilterType.STRING]: {
        operatorOptions: getFilterOptions([
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.EQUALS,
            FilterOperator.NOT_EQUALS,
            FilterOperator.STARTS_WITH,
            FilterOperator.INCLUDE,
            FilterOperator.NOT_INCLUDE,
        ]),
        inputs: DefaultFilterInputs,
    },
    [FilterType.NUMBER]: {
        operatorOptions: getFilterOptions([
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.EQUALS,
            FilterOperator.NOT_EQUALS,
            FilterOperator.LESS_THAN,
            FilterOperator.GREATER_THAN,
        ]),
        inputs: DefaultFilterInputs,
    },
    [FilterType.DATE]: {
        operatorOptions: timeFilterOptions,
        inputs: DateFilterInputs,
    },
    [FilterType.BOOLEAN]: {
        operatorOptions: getFilterOptions([
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.EQUALS,
        ]),
        inputs: BooleanFilterInputs,
    },
};

type FilterRuleLabels = {
    field: string;
    operator: string;
    value?: string;
};

export const getFilterRuleLabel = (
    filterRule: FilterRule,
    field: FilterableField,
): FilterRuleLabels => {
    const filterType = field
        ? getFilterTypeFromField(field)
        : FilterType.STRING;
    const filterConfig = FilterTypeConfig[filterType];
    const operationLabel =
        filterConfig.operatorOptions.find(
            (option) => option.value === filterRule.operator,
        )?.label || filterOperatorLabel[filterRule.operator];
    let valuesText: string | undefined;
    switch (filterType) {
        case FilterType.STRING:
        case FilterType.NUMBER:
            valuesText = filterRule.values?.join(', ');
            break;
        case FilterType.BOOLEAN:
            valuesText = filterRule.values?.map(formatBoolean).join(', ');
            break;
        case FilterType.DATE: {
            if (filterRule.operator === FilterOperator.IN_THE_PAST) {
                valuesText = `${filterRule.values?.[0]} ${
                    filterRule.settings.completed ? 'completed ' : ''
                }${filterRule.settings.unitOfTime}`;
            } else {
                valuesText = filterRule.values
                    ?.map((value) => {
                        if (
                            isDimension(field) &&
                            field.type === DimensionType.TIMESTAMP
                        ) {
                            return formatTimestamp(value, field.timeInterval);
                        } else if (
                            isDimension(field) &&
                            field.type === DimensionType.DATE
                        ) {
                            return formatDate(value, field.timeInterval);
                        } else {
                            return value;
                        }
                    })
                    .join(', ');
            }
            break;
        }
        default: {
            const never: never = filterType;
            throw new Error(`Unexpected filter type: ${filterType}`);
        }
    }
    return {
        field: field.label,
        operator: operationLabel,
        value: valuesText,
    };
};
