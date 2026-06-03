import { DimensionType, MetricType } from '@lightdash/common';
import { FilterOperator, FilterType } from '@lightdash/common';
import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';

const commonBooleanFilterRuleSchema = z.object({
    fieldId: getFieldIdSchema({ additionalDescription: null }),
    fieldType: z.union([
        z.literal(DimensionType.BOOLEAN),
        z.literal(MetricType.BOOLEAN),
    ]),
    fieldFilterType: z.literal(FilterType.BOOLEAN),
});

const booleanFilterSchema = z.union([
    commonBooleanFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.NULL),
            z.literal(FilterOperator.NOT_NULL),
        ]),
    }),
    commonBooleanFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.EQUALS),
            z.literal(FilterOperator.NOT_EQUALS),
        ]),
        values: z.array(z.boolean()).length(1),
    }),
]);

export default booleanFilterSchema;
