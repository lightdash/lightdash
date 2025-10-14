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
            'Type of window function to apply:',
            '',
            'Ranking functions (no fieldId needed):',
            '- row_number: Numbers each row sequentially (1, 2, 3, ...). Use for ranking or identifying rows.',
            '- percent_rank: Calculates the relative rank as a percentage (0.0 to 1.0). Use for percentile analysis.',
            '',
            'Aggregate functions (require fieldId):',
            '- sum: Running totals, moving sums',
            '- avg: Moving averages (e.g., 7-day moving average)',
            '- count: Running counts',
            '- min: Minimum value within frame',
            '- max: Maximum value within frame',
            '',
            'Examples:',
            '- "Number rows by order date" → ROW_NUMBER with orderBy: order_date',
            '- "Rank customers by revenue within each country" → ROW_NUMBER with partitionBy: country, orderBy: revenue DESC',
            '- "Calculate percentile rank of sales" → PERCENT_RANK with orderBy: sales',
            '- "Running total of revenue" → SUM with fieldId: revenue, orderBy: order_date',
            '- "7-day moving average of sales" → AVG with fieldId: sales, orderBy: date',
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
    frame: z.null(),
});

export type TableCalcWindowFunctionSchema = z.infer<
    typeof tableCalcWindowFunctionSchema
>;
