import { z } from 'zod';
import { FilterOperator } from '../../../../types/filter';

const numberFilterSchema = z.union([
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
        values: z.array(z.number()),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.LESS_THAN),
            z.literal(FilterOperator.GREATER_THAN),
        ]),
        values: z.array(z.number()).length(1),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.IN_BETWEEN),
            z.literal(FilterOperator.NOT_IN_BETWEEN),
        ]),
        values: z.array(z.number()).length(2),
    }),
]);

export default numberFilterSchema;
