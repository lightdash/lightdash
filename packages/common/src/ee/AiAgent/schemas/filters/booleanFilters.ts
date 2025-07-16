import { z } from 'zod';
import { FilterOperator } from '../../../../types/filter';

const booleanFilterSchema = z.union([
    z.object({
        operator: z.union([
            z.literal(FilterOperator.NULL),
            z.literal(FilterOperator.NOT_NULL),
        ]),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.EQUALS),
            z.literal(FilterOperator.NOT_EQUALS),
        ]),
        values: z.array(z.boolean()).length(1),
    }),
]);

export default booleanFilterSchema;
