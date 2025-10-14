import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';
import {
    baseTableCalcSchema,
    partitionBySchema,
    partitionBySchemaDescription,
} from './tableCalcBaseSchemas';

export const tableCalcPercentOfColumnTotalSchema = baseTableCalcSchema.extend({
    type: z.literal('percent_of_column_total'),
    fieldId: getFieldIdSchema({
        additionalDescription: 'Field to calculate percentage of column total',
    }),
    partitionBy: z
        .array(partitionBySchema)
        .nullable()
        .describe(partitionBySchemaDescription),
});

export type TableCalcPercentOfColumnTotalSchema = z.infer<
    typeof tableCalcPercentOfColumnTotalSchema
>;
