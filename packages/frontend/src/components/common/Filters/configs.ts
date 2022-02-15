import { FilterOperator, FilterType } from 'common';
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
    [FilterOperator.LESS_THAN]: 'is less than',
    [FilterOperator.LESS_THAN_OR_EQUAL]: 'is less than or equal',
    [FilterOperator.GREATER_THAN]: 'is greater than',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: 'is greater than or equal',
    [FilterOperator.IN_THE_PAST]: 'in the last',
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
