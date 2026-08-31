import {
    FilterOperator,
    FilterType,
    UnitOfTime,
} from '../../../../types/filter';

export type FilterExpressionArgumentCount = 0 | 1 | 2 | 'oneOrMore';

type FilterExpressionOperatorSyntax =
    | {
          syntax: 'presence';
          argumentSyntax: 'none';
      }
    | {
          syntax: 'values';
          argumentSyntax: 'values' | 'relativeDate' | 'currentDate';
      };

export type FilterExpressionOperatorDefinition = {
    operator: FilterOperator;
    argumentCountByFilterType: Record<
        FilterType,
        FilterExpressionArgumentCount | null
    >;
} & FilterExpressionOperatorSyntax;

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

export const filterExpressionRelativeDateOperators = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_NEXT,
] as const;

export const isFilterExpressionRelativeDateOperator = (
    operator: FilterOperator,
): operator is (typeof filterExpressionRelativeDateOperators)[number] =>
    filterExpressionRelativeDateOperators.some(
        (relativeDateOperator) => relativeDateOperator === operator,
    );

const currentDateOperators = [
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.NOT_IN_THE_CURRENT,
] as const;

export const filterExpressionDateUnits = [
    UnitOfTime.days,
    UnitOfTime.weeks,
    UnitOfTime.months,
    UnitOfTime.quarters,
    UnitOfTime.years,
] as const;

export const filterExpressionOperatorDefinitions = [
    {
        operator: FilterOperator.NULL,
        syntax: 'presence',
        argumentSyntax: 'none',
        argumentCountByFilterType: allTypes(0),
    },
    {
        operator: FilterOperator.NOT_NULL,
        syntax: 'presence',
        argumentSyntax: 'none',
        argumentCountByFilterType: allTypes(0),
    },
    {
        operator: FilterOperator.EQUALS,
        syntax: 'values',
        argumentSyntax: 'values',
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
        argumentSyntax: 'values',
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
                argumentSyntax: 'values',
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
                argumentSyntax: 'values',
                argumentCountByFilterType: {
                    ...unsupportedTypes,
                    [FilterType.NUMBER]: 1,
                    [FilterType.DATE]: 1,
                },
            }) satisfies FilterExpressionOperatorDefinition,
    ),
    ...filterExpressionRelativeDateOperators.map(
        (operator) =>
            ({
                operator,
                syntax: 'values',
                argumentSyntax: 'relativeDate',
                argumentCountByFilterType: {
                    ...unsupportedTypes,
                    [FilterType.DATE]: 1,
                },
            }) satisfies FilterExpressionOperatorDefinition,
    ),
    ...currentDateOperators.map(
        (operator) =>
            ({
                operator,
                syntax: 'values',
                argumentSyntax: 'currentDate',
                argumentCountByFilterType: {
                    ...unsupportedTypes,
                    [FilterType.DATE]: 1,
                },
            }) satisfies FilterExpressionOperatorDefinition,
    ),
    {
        operator: FilterOperator.IN_BETWEEN,
        syntax: 'values',
        argumentSyntax: 'values',
        argumentCountByFilterType: {
            ...unsupportedTypes,
            [FilterType.NUMBER]: 2,
            [FilterType.DATE]: 2,
        },
    },
    {
        operator: FilterOperator.NOT_IN_BETWEEN,
        syntax: 'values',
        argumentSyntax: 'values',
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
