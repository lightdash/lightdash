import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';
import { baseTableCalcSchema } from './tableCalcBaseSchemas';

export const tableCalcPercentOfColumnTotalSchema = baseTableCalcSchema.extend({
    type: z.literal('percent_of_column_total'),
    fieldId: getFieldIdSchema({
        additionalDescription: 'Field to calculate percentage of column total',
        includeCustomMetrics: true,
        includeTableCalculations: true,
    }),
});

export type TableCalcPercentOfColumnTotalSchema = z.infer<
    typeof tableCalcPercentOfColumnTotalSchema
>;
