import { z } from 'zod';
import {
    baseTableCalcSchema,
    orderBySchema,
    orderBySchemaDescription,
    partitionBySchema,
    partitionBySchemaDescription,
} from './tableCalcBaseSchemas';

const windowFunctionTypeSchema = z.enum(['row_number', 'percent_rank']);

export const tableCalcWindowFunctionSchema = baseTableCalcSchema.extend({
    type: z.literal('window_function'),
    windowFunction: windowFunctionTypeSchema.describe(
        [
            'Type of window function to apply:',
            '- row_number: Numbers each row sequentially (1, 2, 3, ...). Use for ranking or identifying rows.',
            '- percent_rank: Calculates the relative rank as a percentage (0.0 to 1.0). Use for percentile analysis.',
            '',
            'Examples:',
            '- "Number rows by order date" → ROW_NUMBER with orderBy: order_date',
            '- "Rank customers by revenue within each country" → ROW_NUMBER with partitionBy: country, orderBy: revenue DESC',
            '- "Calculate percentile rank of sales" → PERCENT_RANK with orderBy: sales',
        ].join('\n'),
    ),
    orderBy: z
        .array(orderBySchema)
        .nullable()
        .describe(orderBySchemaDescription),
    partitionBy: z
        .array(partitionBySchema)
        .nullable()
        .describe(partitionBySchemaDescription),
});

export type TableCalcWindowFunctionSchema = z.infer<
    typeof tableCalcWindowFunctionSchema
>;
