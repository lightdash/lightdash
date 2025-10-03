import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';
import {
    baseTableCalcSchema,
    orderBySchema,
    orderBySchemaDescription,
} from './tableCalcBaseSchemas';

export const tableCalcPercentChangeFromPreviousSchema =
    baseTableCalcSchema.extend({
        type: z.literal('percent_change_from_previous'),
        fieldId: getFieldIdSchema({
            additionalDescription: 'Field whose values you want to compare',
        }),
        orderBy: z
            .array(orderBySchema)
            .min(1)
            .describe(orderBySchemaDescription),
    });

export type TableCalcPercentChangeFromPreviousSchema = z.infer<
    typeof tableCalcPercentChangeFromPreviousSchema
>;
