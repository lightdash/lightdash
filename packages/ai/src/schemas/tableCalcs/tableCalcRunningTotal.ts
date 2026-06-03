import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';
import { baseTableCalcSchema } from './tableCalcBaseSchemas';

export const tableCalcRunningTotalSchema = baseTableCalcSchema.extend({
    type: z.literal('running_total'),
    fieldId: getFieldIdSchema({
        additionalDescription: 'Field to calculate running total of',
    }),
});

export type TableCalcRunningTotalSchema = z.infer<
    typeof tableCalcRunningTotalSchema
>;
