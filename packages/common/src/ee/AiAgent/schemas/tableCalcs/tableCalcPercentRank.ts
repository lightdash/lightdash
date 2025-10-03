import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';
import {
    baseTableCalcSchema,
    orderBySchema,
    orderBySchemaDescription,
} from './tableCalcBaseSchemas';

export const tableCalcPercentRankSchema = baseTableCalcSchema.extend({
    type: z.literal('percent_rank'),
    fieldId: getFieldIdSchema({
        additionalDescription: 'Field to calculate percent rank for',
    }),
    orderBy: z.array(orderBySchema).min(1).describe(orderBySchemaDescription),
});

export type TableCalcPercentRankSchema = z.infer<
    typeof tableCalcPercentRankSchema
>;
