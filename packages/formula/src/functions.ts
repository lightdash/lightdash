import type { FunctionDefinition } from './types';

export const ZERO_ARG_FNS = ['TODAY', 'NOW'] as const;

export const SINGLE_ARG_FNS = [
    'ABS',
    'CEIL',
    'CEILING',
    'FLOOR',
    'LEN',
    'LENGTH',
    'TRIM',
    'LOWER',
    'UPPER',
    'YEAR',
    'MONTH',
    'DAY',
    'ISNULL',
    'SUM',
    'AVERAGE',
    'AVG',
] as const;

export const ONE_OR_TWO_ARG_FNS = ['ROUND', 'MIN', 'MAX'] as const;

export const ZERO_OR_ONE_ARG_FNS = ['COUNT'] as const;

export const VARIADIC_FNS = ['CONCAT', 'COALESCE'] as const;

export const WINDOW_FNS = [
    'ROW_NUMBER',
    'RANK',
    'DENSE_RANK',
    'RUNNING_TOTAL',
    'NTILE',
    'FIRST',
    'LAST',
    'LAG',
    'LEAD',
    'MOVING_SUM',
    'MOVING_AVG',
] as const;

export const CONDITIONAL_AGG_FNS = ['SUMIF', 'AVERAGEIF'] as const;

export const BOOLEAN_FNS = ['ISNULL'] as const;

export type ZeroArgFnName = (typeof ZERO_ARG_FNS)[number];
export type SingleArgFnName = (typeof SINGLE_ARG_FNS)[number];
export type OneOrTwoArgFnName = (typeof ONE_OR_TWO_ARG_FNS)[number];
export type ZeroOrOneArgFnName = (typeof ZERO_OR_ONE_ARG_FNS)[number];
export type VariadicFnName = (typeof VARIADIC_FNS)[number];
export type WindowFnName = (typeof WINDOW_FNS)[number];
export type ConditionalAggFnName = (typeof CONDITIONAL_AGG_FNS)[number];

export const ALL_FUNCTION_NAMES = [
    ...ZERO_ARG_FNS,
    ...SINGLE_ARG_FNS,
    ...ONE_OR_TWO_ARG_FNS,
    ...ZERO_OR_ONE_ARG_FNS,
    ...VARIADIC_FNS,
    ...WINDOW_FNS,
    ...CONDITIONAL_AGG_FNS,
    'COUNTIF',
    'IF',
] as const;

export type FunctionName = (typeof ALL_FUNCTION_NAMES)[number];

// oxfmt-ignore
export const FUNCTION_DEFINITIONS = [
    // Logical
    { name: 'IF', description: 'Conditional expression', minArgs: 2, maxArgs: 3, category: 'logical', example: 'IF(price > 100, "expensive", "cheap")' },
    // Math
    { name: 'ABS', description: 'Absolute value', minArgs: 1, maxArgs: 1, category: 'math', example: 'ABS(profit)' },
    { name: 'ROUND', description: 'Round to decimal places', minArgs: 1, maxArgs: 2, category: 'math', example: 'ROUND(price, 2)' },
    { name: 'CEIL', description: 'Round up to integer', minArgs: 1, maxArgs: 1, category: 'math', example: 'CEIL(price)' },
    { name: 'CEILING', description: 'Round up to integer', minArgs: 1, maxArgs: 1, category: 'math', example: 'CEILING(price)' },
    { name: 'FLOOR', description: 'Round down to integer', minArgs: 1, maxArgs: 1, category: 'math', example: 'FLOOR(price)' },
    { name: 'MIN', description: 'Minimum (scalar or aggregate)', minArgs: 1, maxArgs: 2, category: 'math', example: 'MIN(price, cost)' },
    { name: 'MAX', description: 'Maximum (scalar or aggregate)', minArgs: 1, maxArgs: 2, category: 'math', example: 'MAX(price, cost)' },
    // String
    { name: 'CONCAT', description: 'Concatenate strings', minArgs: 1, maxArgs: Infinity, category: 'string', example: 'CONCAT(first_name, " ", last_name)' },
    { name: 'LEN', description: 'String length', minArgs: 1, maxArgs: 1, category: 'string', example: 'LEN(name)' },
    { name: 'LENGTH', description: 'String length', minArgs: 1, maxArgs: 1, category: 'string', example: 'LENGTH(name)' },
    { name: 'TRIM', description: 'Remove whitespace', minArgs: 1, maxArgs: 1, category: 'string', example: 'TRIM(name)' },
    { name: 'LOWER', description: 'To lowercase', minArgs: 1, maxArgs: 1, category: 'string', example: 'LOWER(status)' },
    { name: 'UPPER', description: 'To uppercase', minArgs: 1, maxArgs: 1, category: 'string', example: 'UPPER(status)' },
    // Date
    { name: 'TODAY', description: 'Current date', minArgs: 0, maxArgs: 0, category: 'date', example: 'TODAY()' },
    { name: 'NOW', description: 'Current timestamp', minArgs: 0, maxArgs: 0, category: 'date', example: 'NOW()' },
    { name: 'YEAR', description: 'Extract year', minArgs: 1, maxArgs: 1, category: 'date', example: 'YEAR(order_date)' },
    { name: 'MONTH', description: 'Extract month', minArgs: 1, maxArgs: 1, category: 'date', example: 'MONTH(order_date)' },
    { name: 'DAY', description: 'Extract day', minArgs: 1, maxArgs: 1, category: 'date', example: 'DAY(order_date)' },
    // Null
    { name: 'COALESCE', description: 'First non-null value', minArgs: 1, maxArgs: Infinity, category: 'null', example: 'COALESCE(discount, 0)' },
    { name: 'ISNULL', description: 'Check if null', minArgs: 1, maxArgs: 1, category: 'null', example: 'ISNULL(discount)' },
    // Aggregates
    { name: 'SUM', description: 'Sum values', minArgs: 1, maxArgs: 1, category: 'aggregate', example: 'SUM(revenue)' },
    { name: 'AVERAGE', description: 'Average values', minArgs: 1, maxArgs: 1, category: 'aggregate', example: 'AVERAGE(price)' },
    { name: 'AVG', description: 'Average values', minArgs: 1, maxArgs: 1, category: 'aggregate', example: 'AVG(price)' },
    { name: 'COUNT', description: 'Count values', minArgs: 0, maxArgs: 1, category: 'aggregate', example: 'COUNT(order_id)' },
    // Conditional aggregates
    { name: 'SUMIF', description: 'Sum with condition', minArgs: 2, maxArgs: 2, category: 'aggregate', example: 'SUMIF(revenue, status = "completed")' },
    { name: 'AVERAGEIF', description: 'Average with condition', minArgs: 2, maxArgs: 2, category: 'aggregate', example: 'AVERAGEIF(price, quantity > 0)' },
    { name: 'COUNTIF', description: 'Count with condition', minArgs: 1, maxArgs: 1, category: 'aggregate', example: 'COUNTIF(status = "active")' },
    // Window functions
    { name: 'RUNNING_TOTAL', description: 'Running total (cumulative sum)', minArgs: 1, maxArgs: 1, category: 'window', example: 'RUNNING_TOTAL(revenue)' },
    { name: 'ROW_NUMBER', description: 'Row number', minArgs: 0, maxArgs: 0, category: 'window', example: 'ROW_NUMBER()' },
    { name: 'LAG', description: 'Previous row value', minArgs: 1, maxArgs: 3, category: 'window', example: 'LAG(revenue, 1, 0)' },
    { name: 'LEAD', description: 'Next row value', minArgs: 1, maxArgs: 3, category: 'window', example: 'LEAD(revenue, 1, 0)' },
    { name: 'RANK', description: 'Rank with gaps', minArgs: 0, maxArgs: 0, category: 'window', example: 'RANK()' },
    { name: 'DENSE_RANK', description: 'Rank without gaps', minArgs: 0, maxArgs: 0, category: 'window', example: 'DENSE_RANK()' },
    { name: 'NTILE', description: 'Distribute rows into buckets', minArgs: 1, maxArgs: 1, category: 'window', example: 'NTILE(4)' },
    { name: 'FIRST', description: 'First value in window', minArgs: 1, maxArgs: 1, category: 'window', example: 'FIRST(revenue)' },
    { name: 'LAST', description: 'Last value in window', minArgs: 1, maxArgs: 1, category: 'window', example: 'LAST(revenue)' },
    { name: 'MOVING_SUM', description: 'Moving sum over preceding rows', minArgs: 2, maxArgs: 2, category: 'window', example: 'MOVING_SUM(revenue, 3)' },
    { name: 'MOVING_AVG', description: 'Moving average over preceding rows', minArgs: 2, maxArgs: 2, category: 'window', example: 'MOVING_AVG(revenue, 7)' },
] as const satisfies readonly FunctionDefinition[];

export type FunctionDefinitionEntry = (typeof FUNCTION_DEFINITIONS)[number];

export type FunctionDefinitionFor<N extends FunctionName> = Extract<
    FunctionDefinitionEntry,
    { name: N }
>;

type _AssertAllFunctionsDefined = [
    Exclude<FunctionName, FunctionDefinitionEntry['name']>,
] extends [never]
    ? true
    : {
          error: 'Missing function definitions for';
          names: Exclude<FunctionName, FunctionDefinitionEntry['name']>;
      };
const _assertAllFunctionsDefined: _AssertAllFunctionsDefined = true;

function formatFunctionArgs(fn: FunctionDefinition): string {
    if (fn.maxArgs === 0) return '()';
    if (fn.maxArgs === Infinity) return '(arg1, arg2, ...)';
    const required = Array.from(
        { length: fn.minArgs },
        (_, i) => `arg${i + 1}`,
    ).join(', ');
    const optional =
        fn.maxArgs > fn.minArgs
            ? `, [${Array.from(
                  { length: fn.maxArgs - fn.minArgs },
                  (_, i) => `optional${i + 1}`,
              ).join(', ')}]`
            : '';
    return `(${required}${optional})`;
}

export const FUNCTION_CATALOG: string = (() => {
    const byCategory: Record<string, string[]> = {};
    for (const fn of FUNCTION_DEFINITIONS) {
        const cat = fn.category.toUpperCase();
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(
            `  ${fn.name}${formatFunctionArgs(fn)} - ${fn.description}${fn.example ? ` (e.g. ${fn.example})` : ''}`,
        );
    }
    return Object.entries(byCategory)
        .map(([cat, fns]) => `${cat}:\n${fns.join('\n')}`)
        .join('\n\n');
})();

export function getParserOptions() {
    return {
        zeroArgFns: ZERO_ARG_FNS,
        singleArgFns: SINGLE_ARG_FNS,
        oneOrTwoArgFns: ONE_OR_TWO_ARG_FNS,
        zeroOrOneArgFns: ZERO_OR_ONE_ARG_FNS,
        variadicFns: VARIADIC_FNS,
        windowFns: WINDOW_FNS,
        conditionalAggFns: CONDITIONAL_AGG_FNS,
        allFunctionNames: ALL_FUNCTION_NAMES,
        booleanFns: BOOLEAN_FNS,
    };
}
