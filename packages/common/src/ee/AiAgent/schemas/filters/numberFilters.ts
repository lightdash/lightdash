import { z } from 'zod';
import { DimensionType, MetricType } from '../../../../types/field';
import { FilterOperator, FilterType } from '../../../../types/filter';
import { getFieldIdSchema } from '../fieldId';

const commonNumberFilterRuleSchema = z.object({
    fieldId: getFieldIdSchema({ additionalDescription: null }),
    fieldType: z.union([
        z.literal(DimensionType.NUMBER),
        z.literal(MetricType.NUMBER),
        z.literal(MetricType.PERCENTILE),
        z.literal(MetricType.MEDIAN),
        z.literal(MetricType.AVERAGE),
        z.literal(MetricType.COUNT),
        z.literal(MetricType.COUNT_DISTINCT),
        z.literal(MetricType.SUM),
        z.literal(MetricType.MIN),
        z.literal(MetricType.MAX),
    ]),
    fieldFilterType: z.literal(FilterType.NUMBER),
});

const numberFilterSchema = z.union([
    commonNumberFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.NULL),
            z.literal(FilterOperator.NOT_NULL),
        ]),
    }),
    commonNumberFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.EQUALS),
            z.literal(FilterOperator.NOT_EQUALS),
        ]),
        values: z.array(z.number()),
    }),
    commonNumberFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.LESS_THAN),
            z.literal(FilterOperator.LESS_THAN_OR_EQUAL),
            z.literal(FilterOperator.GREATER_THAN),
            z.literal(FilterOperator.GREATER_THAN_OR_EQUAL),
        ]),
        values: z.array(z.number()).length(1),
    }),
    commonNumberFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.IN_BETWEEN),
            z.literal(FilterOperator.NOT_IN_BETWEEN),
        ]),
        values: z.array(z.number()).length(2),
    }),
]);

export default numberFilterSchema;
