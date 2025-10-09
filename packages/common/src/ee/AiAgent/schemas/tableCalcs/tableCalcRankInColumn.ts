import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';
import { baseTableCalcSchema } from './tableCalcBaseSchemas';

export const tableCalcRankInColumnSchema = baseTableCalcSchema.extend({
    type: z.literal('rank_in_column'),
    fieldId: getFieldIdSchema({
        additionalDescription: 'Field to rank by',
        includeCustomMetrics: true,
        includeTableCalculations: true,
    }),
});

export type TableCalcRankInColumnSchema = z.infer<
    typeof tableCalcRankInColumnSchema
>;
