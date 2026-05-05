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
    'LAST_DAY',
    'ISNULL',
    'SUM',
    'AVERAGE',
    'AVG',
] as const;

export const ONE_OR_TWO_ARG_FNS = ['ROUND', 'MIN', 'MAX'] as const;

export const TWO_ARG_FNS = ['LEFT', 'RIGHT', 'STRPOS', 'STARTS_WITH'] as const;

export const THREE_ARG_FNS = ['REPLACE', 'SUBSTRING', 'SPLIT_PART'] as const;

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
] as const;

// Window functions whose `preceding` count is a parse-time integer literal,
// validated and lifted onto the AST node like DateFn's unit.
export const MOVING_WINDOW_FNS = ['MOVING_SUM', 'MOVING_AVG'] as const;

export const CONDITIONAL_AGG_FNS = ['SUMIF', 'AVERAGEIF'] as const;

export const BOOLEAN_FNS = ['ISNULL'] as const;

// Two-arg functions whose result type is boolean. Reachable from BooleanAtom
// (via a dedicated grammar rule) so they parse cleanly inside `IF` conditions
// like `IF(STARTS_WITH(url, "https://"), …)`. Listed in TWO_ARG_FNS as well
// so the AST node is the same `TwoArgFnNode` shape as LEFT/RIGHT/STRPOS — the
// boolean-vs-number distinction is purely a parser-context concern, not an
// AST concern.
export const BOOLEAN_TWO_ARG_FNS = ['STARTS_WITH'] as const;

// Functions that take a whitelisted unit literal as one of their arguments.
// Parsed by dedicated grammar rules (like IF/SUMIF) rather than a generic
// N-arg bucket because the unit is a compile-time string validated at parse.
// DATE_SUB is a user-facing alias that desugars to DATE_ADD with negated `n`
// at parse time, so the AST only ever carries DATE_TRUNC / DATE_ADD /
// DATE_DIFF.
export const DATE_FNS = [
    'DATE_TRUNC',
    'DATE_ADD',
    'DATE_SUB',
    'DATE_DIFF',
] as const;

export type ZeroArgFnName = (typeof ZERO_ARG_FNS)[number];
export type SingleArgFnName = (typeof SINGLE_ARG_FNS)[number];
export type OneOrTwoArgFnName = (typeof ONE_OR_TWO_ARG_FNS)[number];
export type TwoArgFnName = (typeof TWO_ARG_FNS)[number];
export type ThreeArgFnName = (typeof THREE_ARG_FNS)[number];
export type ZeroOrOneArgFnName = (typeof ZERO_OR_ONE_ARG_FNS)[number];
export type VariadicFnName = (typeof VARIADIC_FNS)[number];
export type WindowFnName = (typeof WINDOW_FNS)[number];
export type MovingWindowFnName = (typeof MOVING_WINDOW_FNS)[number];
export type ConditionalAggFnName = (typeof CONDITIONAL_AGG_FNS)[number];
export type BooleanTwoArgFnName = (typeof BOOLEAN_TWO_ARG_FNS)[number];
export type DateFnName = (typeof DATE_FNS)[number];
// DATE_SUB desugars to DATE_ADD at parse time, so it never appears in the AST.
export type DateFnAstName = Exclude<DateFnName, 'DATE_SUB'>;

export const ALL_FUNCTION_NAMES = [
    ...ZERO_ARG_FNS,
    ...SINGLE_ARG_FNS,
    ...ONE_OR_TWO_ARG_FNS,
    ...TWO_ARG_FNS,
    ...THREE_ARG_FNS,
    ...ZERO_OR_ONE_ARG_FNS,
    ...VARIADIC_FNS,
    ...WINDOW_FNS,
    ...MOVING_WINDOW_FNS,
    ...CONDITIONAL_AGG_FNS,
    ...DATE_FNS,
    'COUNTIF',
    'IF',
] as const;

export type FunctionName = (typeof ALL_FUNCTION_NAMES)[number];

// oxfmt-ignore
export const FUNCTION_DEFINITIONS = [
    // Logical
    { name: 'IF', description: 'Conditional expression', minArgs: 2, maxArgs: 3, category: 'logical' },
    // Math
    { name: 'ABS', description: 'Absolute value', minArgs: 1, maxArgs: 1, category: 'math' },
    { name: 'ROUND', description: 'Round to decimal places', minArgs: 1, maxArgs: 2, category: 'math' },
    { name: 'CEIL', description: 'Round up to integer', minArgs: 1, maxArgs: 1, category: 'math' },
    { name: 'CEILING', description: 'Round up to integer', minArgs: 1, maxArgs: 1, category: 'math' },
    { name: 'FLOOR', description: 'Round down to integer', minArgs: 1, maxArgs: 1, category: 'math' },
    { name: 'MIN', description: 'Minimum (scalar or aggregate)', minArgs: 1, maxArgs: 2, category: 'math' },
    { name: 'MAX', description: 'Maximum (scalar or aggregate)', minArgs: 1, maxArgs: 2, category: 'math' },
    // String
    { name: 'CONCAT', description: 'Concatenate strings', minArgs: 1, maxArgs: Infinity, category: 'string' },
    { name: 'LEN', description: 'String length', minArgs: 1, maxArgs: 1, category: 'string' },
    { name: 'LENGTH', description: 'String length', minArgs: 1, maxArgs: 1, category: 'string' },
    { name: 'TRIM', description: 'Remove whitespace', minArgs: 1, maxArgs: 1, category: 'string' },
    { name: 'LOWER', description: 'To lowercase', minArgs: 1, maxArgs: 1, category: 'string' },
    { name: 'UPPER', description: 'To uppercase', minArgs: 1, maxArgs: 1, category: 'string' },
    { name: 'LEFT', description: 'Leftmost N characters', minArgs: 2, maxArgs: 2, category: 'string' },
    { name: 'RIGHT', description: 'Rightmost N characters', minArgs: 2, maxArgs: 2, category: 'string' },
    { name: 'REPLACE', description: 'Replace all occurrences of a substring (e.g. REPLACE(text, "old", "new"))', minArgs: 3, maxArgs: 3, category: 'string' },
    { name: 'SUBSTRING', description: 'Extract substring by 1-indexed start and length (e.g. SUBSTRING(text, 1, 5))', minArgs: 3, maxArgs: 3, category: 'string' },
    { name: 'SPLIT_PART', description: 'Split text on a delimiter and return the n-th part (1-indexed). E.g. SPLIT_PART(email, "@", 2) returns the domain.', minArgs: 3, maxArgs: 3, category: 'string' },
    { name: 'STRPOS', description: '1-indexed position of substring in text; 0 if not found. E.g. STRPOS("hello", "ll") returns 3.', minArgs: 2, maxArgs: 2, category: 'string' },
    { name: 'STARTS_WITH', description: 'True if text begins with prefix. E.g. STARTS_WITH(url, "https://").', minArgs: 2, maxArgs: 2, category: 'string' },
    // Date
    { name: 'TODAY', description: 'Current date', minArgs: 0, maxArgs: 0, category: 'date' },
    { name: 'NOW', description: 'Current timestamp', minArgs: 0, maxArgs: 0, category: 'date' },
    { name: 'YEAR', description: 'Extract year', minArgs: 1, maxArgs: 1, category: 'date' },
    { name: 'MONTH', description: 'Extract month', minArgs: 1, maxArgs: 1, category: 'date' },
    { name: 'DAY', description: 'Extract day', minArgs: 1, maxArgs: 1, category: 'date' },
    { name: 'LAST_DAY', description: 'Last day of the month', minArgs: 1, maxArgs: 1, category: 'date' },
    { name: 'DATE_TRUNC', description: 'Truncate a date to the start of a period ("day" | "week" | "month" | "quarter" | "year")', minArgs: 2, maxArgs: 2, category: 'date' },
    { name: 'DATE_ADD', description: 'Add an integer interval to a date (e.g. DATE_ADD(d, 3, "month"))', minArgs: 3, maxArgs: 3, category: 'date' },
    { name: 'DATE_SUB', description: 'Subtract an integer interval from a date (e.g. DATE_SUB(d, 3, "month"))', minArgs: 3, maxArgs: 3, category: 'date' },
    { name: 'DATE_DIFF', description: 'Whole-unit calendar-boundary difference between two dates (e.g. DATE_DIFF(a, b, "month") — positive when b > a)', minArgs: 3, maxArgs: 3, category: 'date' },
    // Null
    { name: 'COALESCE', description: 'First non-null value', minArgs: 1, maxArgs: Infinity, category: 'null' },
    { name: 'ISNULL', description: 'Check if null', minArgs: 1, maxArgs: 1, category: 'null' },
    // Aggregates
    { name: 'SUM', description: 'Sum values', minArgs: 1, maxArgs: 1, category: 'aggregate' },
    { name: 'AVERAGE', description: 'Average values', minArgs: 1, maxArgs: 1, category: 'aggregate' },
    { name: 'AVG', description: 'Average values', minArgs: 1, maxArgs: 1, category: 'aggregate' },
    { name: 'COUNT', description: 'Count values', minArgs: 0, maxArgs: 1, category: 'aggregate' },
    // Conditional aggregates
    { name: 'SUMIF', description: 'Sum with condition', minArgs: 2, maxArgs: 2, category: 'aggregate' },
    { name: 'AVERAGEIF', description: 'Average with condition', minArgs: 2, maxArgs: 2, category: 'aggregate' },
    { name: 'COUNTIF', description: 'Count with condition', minArgs: 1, maxArgs: 1, category: 'aggregate' },
    // Window functions
    { name: 'RUNNING_TOTAL', description: 'Running total (cumulative sum)', minArgs: 1, maxArgs: 1, category: 'window' },
    { name: 'ROW_NUMBER', description: 'Row number', minArgs: 0, maxArgs: 0, category: 'window' },
    { name: 'LAG', description: 'Previous row value', minArgs: 1, maxArgs: 3, category: 'window' },
    { name: 'LEAD', description: 'Next row value', minArgs: 1, maxArgs: 3, category: 'window' },
    { name: 'RANK', description: 'Rank with gaps', minArgs: 0, maxArgs: 0, category: 'window' },
    { name: 'DENSE_RANK', description: 'Rank without gaps', minArgs: 0, maxArgs: 0, category: 'window' },
    { name: 'NTILE', description: 'Distribute rows into buckets', minArgs: 1, maxArgs: 1, category: 'window' },
    { name: 'FIRST', description: 'First value in window', minArgs: 1, maxArgs: 1, category: 'window' },
    { name: 'LAST', description: 'Last value in window', minArgs: 1, maxArgs: 1, category: 'window' },
    { name: 'MOVING_SUM', description: 'Moving sum over preceding rows', minArgs: 2, maxArgs: 2, category: 'window' },
    { name: 'MOVING_AVG', description: 'Moving average over preceding rows', minArgs: 2, maxArgs: 2, category: 'window' },
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
            `  ${fn.name}${formatFunctionArgs(fn)} - ${fn.description}`,
        );
    }
    return Object.entries(byCategory)
        .map(([cat, fns]) => `${cat}:\n${fns.join('\n')}`)
        .join('\n\n');
})();

// Unit literals accepted by date functions (DATE_TRUNC today; DATE_ADD/SUB/
// DIFF in follow-up PRs). Validated at parse time against this list.
export const DATE_UNITS = ['day', 'week', 'month', 'quarter', 'year'] as const;

export function getParserOptions() {
    return {
        zeroArgFns: ZERO_ARG_FNS,
        singleArgFns: SINGLE_ARG_FNS,
        oneOrTwoArgFns: ONE_OR_TWO_ARG_FNS,
        twoArgFns: TWO_ARG_FNS,
        threeArgFns: THREE_ARG_FNS,
        zeroOrOneArgFns: ZERO_OR_ONE_ARG_FNS,
        variadicFns: VARIADIC_FNS,
        windowFns: WINDOW_FNS,
        movingWindowFns: MOVING_WINDOW_FNS,
        conditionalAggFns: CONDITIONAL_AGG_FNS,
        dateFns: DATE_FNS,
        dateUnits: DATE_UNITS,
        allFunctionNames: ALL_FUNCTION_NAMES,
        booleanFns: BOOLEAN_FNS,
        booleanTwoArgFns: BOOLEAN_TWO_ARG_FNS,
    };
}
