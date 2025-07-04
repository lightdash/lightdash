import { z } from 'zod';
import { FilterOperator } from '../../../../types/filter';

const stringFilterSchema = z.union([
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
            z.literal(FilterOperator.STARTS_WITH),
            z.literal(FilterOperator.ENDS_WITH),
            z.literal(FilterOperator.INCLUDE),
            z.literal(FilterOperator.NOT_INCLUDE),
        ]),
        values: z.array(z.string()),
    }),
]);

export default stringFilterSchema;
