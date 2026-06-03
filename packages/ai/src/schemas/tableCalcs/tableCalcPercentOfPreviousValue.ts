import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';
import {
    baseTableCalcSchema,
    orderBySchema,
    orderBySchemaDescription,
    partitionBySchema,
    partitionBySchemaDescription,
} from './tableCalcBaseSchemas';

export const tableCalcPercentOfPreviousValueSchema = baseTableCalcSchema.extend(
    {
        type: z.literal('percent_of_previous_value'),
        fieldId: getFieldIdSchema({
            additionalDescription: 'Field whose values you want to compare',
        }),
        orderBy: z
            .array(orderBySchema)
            .min(1)
            .describe(orderBySchemaDescription),
        partitionBy: z
            .array(partitionBySchema)
            .nullable()
            .describe(partitionBySchemaDescription),
    },
);

export type TableCalcPercentOfPreviousValueSchema = z.infer<
    typeof tableCalcPercentOfPreviousValueSchema
>;
