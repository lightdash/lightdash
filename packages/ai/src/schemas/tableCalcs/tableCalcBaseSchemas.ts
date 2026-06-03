import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';

export const orderBySchema = z.object({
    fieldId: getFieldIdSchema({ additionalDescription: 'Field to order by' }),
    order: z.enum(['asc', 'desc']).nullable(),
});
export const orderBySchemaDescription = [
    'Specifies the order in which rows are processed by the table calculation.',
    'For time-series: typically order by date/time ascending.',
    'For rankings: order by the metric you want to rank, descending for highest-first.',
].join('\n');

export const partitionBySchema = getFieldIdSchema({
    additionalDescription: null,
});
export const partitionBySchemaDescription = [
    'Fields to PARTITION BY - divides result set into independent groups.',
    'Each partition calculates independently (rankings restart, percentages sum to 100% per partition).',
    'Empty array or null: single partition (calculations across all rows).',
].join('\n');

export const baseTableCalcSchema = z.object({
    name: z
        .string()
        .describe(
            'Unique name for the table calculation, e.g. "percent_change_from_previous"',
        ),
    displayName: z
        .string()
        .describe(
            'Display name for the table calculation, e.g. "MoM revenue change"',
        ),
});
