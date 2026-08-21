import { FilterOperator, FilterType } from '../../../../types/filter';

export type FilterExpressionArgumentCount = 0 | 1 | 2 | 3 | 'oneOrMore';

export type FilterExpressionOperatorDefinition = {
    operator: FilterOperator;
    syntax: 'presence' | 'values';
    argumentCountByFilterType: Record<
        FilterType,
        FilterExpressionArgumentCount | null
    >;
};

const allTypes = (argumentCount: FilterExpressionArgumentCount) => ({
    [FilterType.BOOLEAN]: argumentCount,
    [FilterType.STRING]: argumentCount,
    [FilterType.NUMBER]: argumentCount,
    [FilterType.DATE]: argumentCount,
});

const unsupportedTypes = {
    [FilterType.BOOLEAN]: null,
    [FilterType.STRING]: null,
    [FilterType.NUMBER]: null,
    [FilterType.DATE]: null,
} satisfies Record<FilterType, null>;

const stringOperators = [
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
] as const;

const comparisonOperators = [
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
] as const;

const relativeDateOperators = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_NEXT,
] as const;

const currentDateOperators = [
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.NOT_IN_THE_CURRENT,
] as const;

export const filterExpressionOperatorDefinitions = [
    {
        operator: FilterOperator.NULL,
        syntax: 'presence',
        argumentCountByFilterType: allTypes(0),
    },
    {
        operator: FilterOperator.NOT_NULL,
        syntax: 'presence',
        argumentCountByFilterType: allTypes(0),
    },
    {
        operator: FilterOperator.EQUALS,
        syntax: 'values',
        argumentCountByFilterType: {
            [FilterType.BOOLEAN]: 1,
            [FilterType.STRING]: 'oneOrMore',
            [FilterType.NUMBER]: 'oneOrMore',
            [FilterType.DATE]: 'oneOrMore',
        },
    },
    {
        operator: FilterOperator.NOT_EQUALS,
        syntax: 'values',
        argumentCountByFilterType: {
            [FilterType.BOOLEAN]: 1,
            [FilterType.STRING]: 'oneOrMore',
            [FilterType.NUMBER]: 'oneOrMore',
            [FilterType.DATE]: 'oneOrMore',
        },
    },
    ...stringOperators.map(
        (operator) =>
            ({
                operator,
                syntax: 'values',
                argumentCountByFilterType: {
                    ...unsupportedTypes,
                    [FilterType.STRING]: 'oneOrMore',
                },
            }) satisfies FilterExpressionOperatorDefinition,
    ),
    ...comparisonOperators.map(
        (operator) =>
            ({
                operator,
                syntax: 'values',
                argumentCountByFilterType: {
                    ...unsupportedTypes,
                    [FilterType.NUMBER]: 1,
                    [FilterType.DATE]: 1,
                },
            }) satisfies FilterExpressionOperatorDefinition,
    ),
    ...relativeDateOperators.map(
        (operator) =>
            ({
                operator,
                syntax: 'values',
                argumentCountByFilterType: {
                    ...unsupportedTypes,
                    [FilterType.DATE]: 3,
                },
            }) satisfies FilterExpressionOperatorDefinition,
    ),
    ...currentDateOperators.map(
        (operator) =>
            ({
                operator,
                syntax: 'values',
                argumentCountByFilterType: {
                    ...unsupportedTypes,
                    [FilterType.DATE]: 1,
                },
            }) satisfies FilterExpressionOperatorDefinition,
    ),
    {
        operator: FilterOperator.IN_BETWEEN,
        syntax: 'values',
        argumentCountByFilterType: {
            ...unsupportedTypes,
            [FilterType.NUMBER]: 2,
            [FilterType.DATE]: 2,
        },
    },
    {
        operator: FilterOperator.NOT_IN_BETWEEN,
        syntax: 'values',
        argumentCountByFilterType: {
            ...unsupportedTypes,
            [FilterType.NUMBER]: 2,
        },
    },
] as const satisfies readonly FilterExpressionOperatorDefinition[];

export type FilterExpressionOperator =
    (typeof filterExpressionOperatorDefinitions)[number]['operator'];

export const filterExpressionOperators: readonly FilterExpressionOperator[] =
    filterExpressionOperatorDefinitions.map(({ operator }) => operator);

export const isFilterExpressionOperator = (
    value: string,
): value is FilterExpressionOperator =>
    filterExpressionOperatorDefinitions.some(
        ({ operator }) => operator === value,
    );
