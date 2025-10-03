import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';

export const orderBySchema = z.object({
    fieldId: getFieldIdSchema({ additionalDescription: 'Field to order by' }),
    order: z.enum(['asc', 'desc']).nullable(),
});
export const orderBySchemaDescription = [].join('\n');

export const partitionBySchema = getFieldIdSchema({
    additionalDescription: null,
});
export const partitionBySchemaDescription = [
    'Fields to PARTITION BY',
    'If you want to compare across the table, no need for partition',
    'If you want to compare values between only rows with the same value in the partitionBy fields (e.g. same `status` or `category`), you need to partition by the fields',
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
