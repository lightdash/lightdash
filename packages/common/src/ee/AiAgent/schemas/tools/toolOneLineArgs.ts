import { z } from 'zod';
import { AiResultType } from '../../types';
import fieldIdSchema from '../fieldId';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
import sortFieldSchema from '../sortField';

const lighterMetricQuerySchema = z.object({
    type: z.literal(AiResultType.ONE_LINE_RESULT),
    exploreName: z
        .string()
        .describe('Name of the explore to query. @example: "users"'),
    metrics: z
        .array(fieldIdSchema)
        .describe(
            'Metrics (measures) to calculate over the table for this query. @example: ["payments_total_amount", "orders_total_shipping_cost"]',
        ),
    dimensions: z
        .array(fieldIdSchema)
        .describe(
            'Dimensions to break down the metric into groups. @example: ["orders_status", "customers_first_name"]',
        ),
    sorts: z
        .array(sortFieldSchema)
        .describe(
            'Sort configuration for the MetricQuery. Should be an empty array if no sorting is needed',
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .describe('Maximum number of rows to return from query'),
});

export const toolOneLineArgsSchema = z.object({
    type: z.literal(AiResultType.ONE_LINE_RESULT),
    metricQuery: lighterMetricQuerySchema,
    filters: filtersSchema.nullable().describe('Filters to apply to the query'),
});

export type ToolOneLineArgs = z.infer<typeof toolOneLineArgsSchema>;

export const toolOneLineArgsSchemaTransformed = toolOneLineArgsSchema.transform(
    (data) => ({
        ...data,
        filters: filtersSchemaTransformed.parse(data.filters),
    }),
);

export type ToolOneLineArgsTransformed = z.infer<
    typeof toolOneLineArgsSchemaTransformed
>;
