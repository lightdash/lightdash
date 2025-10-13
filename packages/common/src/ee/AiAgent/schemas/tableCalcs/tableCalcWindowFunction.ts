import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';
import {
    baseTableCalcSchema,
    orderBySchema,
    orderBySchemaDescription,
    partitionBySchema,
    partitionBySchemaDescription,
} from './tableCalcBaseSchemas';

const windowFunctionTypeSchema = z.enum([
    'row_number',
    'percent_rank',
    'sum',
    'avg',
    'count',
    'min',
    'max',
]);

export const tableCalcWindowFunctionSchema = baseTableCalcSchema.extend({
    type: z.literal('window_function'),
    windowFunction: windowFunctionTypeSchema.describe(
        [
            'Type of window function to apply.',
            '',
            '**Ranking functions** (fieldId optional, ignored if provided):',
            '- row_number: Sequential numbering (1, 2, 3...)',
            '- percent_rank: Relative rank as percentage (0.0-1.0)',
            '',
            '**Aggregate functions** (fieldId required):',
            '- sum: Sum values within frame',
            '- avg: Average values within frame',
            '- count: Count values within frame',
            '- min: Minimum value within frame',
            '- max: Maximum value within frame',
        ].join('\n'),
    ),
    fieldId: getFieldIdSchema({
        additionalDescription:
            'Field to aggregate (required for sum/avg/count/min/max, not used for row_number/percent_rank)',
    }).nullable(),
    orderBy: z
        .array(orderBySchema)
        .nullable()
        .describe(orderBySchemaDescription),
    partitionBy: z
        .array(partitionBySchema)
        .nullable()
        .describe(partitionBySchemaDescription),
    frame: z
        .object({
            frameType: z
                .enum(['rows', 'range'])
                .describe(
                    [
                        'Frame type:',
                        '- rows: Physical row count',
                        '- range: Logical value-based (includes peer rows with same ORDER BY value)',
                    ].join('\n'),
                ),
            start: z
                .object({
                    type: z.enum([
                        'unbounded_preceding',
                        'preceding',
                        'current_row',
                        'following',
                        'unbounded_following',
                    ]),
                    offset: z
                        .number()
                        .int()
                        .positive()
                        .nullable()
                        .describe(
                            'Number of rows for PRECEDING/FOLLOWING (e.g., 6 for "6 PRECEDING")',
                        ),
                })
                .nullable()
                .describe('Start boundary. Null for single-boundary syntax.'),
            end: z
                .object({
                    type: z.enum([
                        'unbounded_preceding',
                        'preceding',
                        'current_row',
                        'following',
                        'unbounded_following',
                    ]),
                    offset: z
                        .number()
                        .int()
                        .positive()
                        .nullable()
                        .describe('Number of rows for PRECEDING/FOLLOWING'),
                })
                .describe('End boundary (required)'),
        })
        .nullable()
        .describe(
            [
                'Defines which rows to include in calculation. Null uses database defaults.',
                '',
                '**Common patterns:**',
                '- Moving average (N periods): {frameType: "rows", start: {type: "preceding", offset: N-1}, end: {type: "current_row"}}',
                '- Running total: {frameType: "rows", start: {type: "unbounded_preceding"}, end: {type: "current_row"}}',
                '- Centered window: {frameType: "rows", start: {type: "preceding", offset: 1}, end: {type: "following", offset: 1}}',
                '',
                '**Default when null:**',
                '- Aggregates WITH ORDER BY: RANGE UNBOUNDED PRECEDING AND CURRENT ROW (cumulative)',
                '- Aggregates WITHOUT ORDER BY: Entire partition (all rows)',
                '- Ranking functions: Always use entire partition (frame clause has no effect)',
            ].join('\n'),
        ),
});

export type TableCalcWindowFunctionSchema = z.infer<
    typeof tableCalcWindowFunctionSchema
>;
