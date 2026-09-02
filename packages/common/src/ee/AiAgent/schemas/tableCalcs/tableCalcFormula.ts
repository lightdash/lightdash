import { z } from 'zod';
import { baseTableCalcSchema } from './tableCalcBaseSchemas';

// Names must exist in @lightdash/formula's catalog; common cannot depend on
// that (private) package, so a backend test guards this list against drift.
export const FORMULA_SCHEMA_FUNCTION_NAMES = {
    general: ['IF', 'COALESCE', 'ROUND', 'ABS', 'CONCAT'],
    date: ['YEAR', 'DATE_TRUNC', 'DATE_DIFF', 'DATE_ADD'],
    aggregate: ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'SUMIF'],
    window: [
        'RUNNING_TOTAL',
        'MOVING_SUM',
        'MOVING_AVG',
        'LAG',
        'LEAD',
        'RANK',
        'DENSE_RANK',
        'ROW_NUMBER',
        'FIRST',
        'LAST',
    ],
} as const;

const formulaDescription = [
    'Spreadsheet-like formula evaluated row-by-row over the query results (after aggregation).',
    'Reference fields by their field id directly, e.g. `orders_total_revenue / orders_order_count`. No prefix, no braces, no leading `=`.',
    'Any selected dimension, metric, custom metric (`<table>_<name>`), or another table calculation name can be referenced.',
    'Operators: + - * / % ^, comparisons = < > <= >= <>, boolean AND/OR/NOT, string literals in double quotes, parentheses for grouping.',
    `Functions include ${FORMULA_SCHEMA_FUNCTION_NAMES.general.join(
        ', ',
    )}, date functions (${FORMULA_SCHEMA_FUNCTION_NAMES.date.join(
        ', ',
    )}), aggregates over the whole result (${FORMULA_SCHEMA_FUNCTION_NAMES.aggregate.join(
        ', ',
    )}), and window functions (${FORMULA_SCHEMA_FUNCTION_NAMES.window.join(
        ', ',
    )}).`,
    'Window functions accept optional PARTITION BY / ORDER BY clauses as trailing arguments, e.g. `LAG(orders_total_revenue, PARTITION BY orders_status, ORDER BY orders_order_date)`.',
    'MOVING_SUM and MOVING_AVG take the count of preceding rows as second argument; the current row is always included, so a trailing 3-period average is `MOVING_AVG(orders_total_revenue, 2, ORDER BY orders_order_month)`.',
    'All branches of an IF must return the same type.',
].join('\n');

// The formula grammar requires a leading '='; the agent writes formulas without it
export function withLeadingEquals(formula: string): string {
    const trimmed = formula.trim();
    return trimmed.startsWith('=') ? trimmed : `=${trimmed}`;
}

export const tableCalcFormulaSchema = baseTableCalcSchema.extend({
    type: z.literal('formula'),
    formula: z.string().describe(formulaDescription),
    format: z
        .enum(['number', 'percent'])
        .nullable()
        .describe(
            'Display format. Use "percent" for ratios/shares/percent changes (value 0.12 renders as 12%). null defaults to "number".',
        ),
    resultType: z
        .enum(['number', 'string', 'date', 'timestamp', 'boolean'])
        .nullable()
        .describe(
            'Data type the formula evaluates to. null defaults to "number".',
        ),
});

export type TableCalcFormulaSchema = z.infer<typeof tableCalcFormulaSchema>;
