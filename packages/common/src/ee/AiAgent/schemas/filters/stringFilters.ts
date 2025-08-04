import { z } from 'zod';
import { DimensionType, MetricType } from '../../../../types/field';
import { FilterOperator, FilterType } from '../../../../types/filter';
import { getFieldIdSchema } from '../fieldId';

const commonStringFilterRuleSchema = z.object({
    fieldId: getFieldIdSchema({ additionalDescription: null }),
    fieldType: z.union([
        z.literal(DimensionType.STRING),
        z.literal(MetricType.STRING),
    ]),
    fieldFilterType: z.literal(FilterType.STRING),
});

const stringFilterSchema = z.union([
    commonStringFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.NULL),
            z.literal(FilterOperator.NOT_NULL),
        ]),
    }),
    commonStringFilterRuleSchema.extend({
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
