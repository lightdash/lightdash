import { z } from 'zod';
import { DimensionType, MetricType } from '../../../../types/field';
import { FilterOperator, FilterType } from '../../../../types/filter';
import { getFieldIdSchema } from '../fieldId';
import {
    filterJsonExamples,
    filterOperatorList,
    valuePresenceOperatorDescription,
} from './filterDescriptionUtils';

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
        z.literal(MetricType.SUM_DISTINCT),
        z.literal(MetricType.AVERAGE_DISTINCT),
        z.literal(MetricType.MIN),
        z.literal(MetricType.MAX),
    ]),
    fieldFilterType: z.literal(FilterType.NUMBER),
});

const numberFilterSchema = z.union([
    commonNumberFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.NULL),
                    z.literal(FilterOperator.NOT_NULL),
                ])
                .describe(valuePresenceOperatorDescription),
        })
        .describe(
            `Use for numeric fields when checking if a value is missing or present. Do not include values. ${filterJsonExamples(
                {
                    fieldId: 'orders_total_revenue',
                    fieldType: MetricType.SUM,
                    fieldFilterType: FilterType.NUMBER,
                    operator: FilterOperator.NULL,
                },
                {
                    fieldId: 'orders_total_revenue',
                    fieldType: MetricType.SUM,
                    fieldFilterType: FilterType.NUMBER,
                    operator: FilterOperator.NOT_NULL,
                },
            )}`,
        ),
    commonNumberFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.EQUALS),
                    z.literal(FilterOperator.NOT_EQUALS),
                ])
                .describe(
                    `Use ${filterOperatorList(FilterOperator.EQUALS, FilterOperator.NOT_EQUALS)} for exact numeric matches.`,
                ),
            values: z
                .array(z.number())
                .describe('One or more exact numeric values to match.'),
        })
        .describe(
            `Use for numeric fields that equal or exclude specific values. ${filterJsonExamples(
                {
                    fieldId: 'orders_item_count',
                    fieldType: MetricType.COUNT,
                    fieldFilterType: FilterType.NUMBER,
                    operator: FilterOperator.EQUALS,
                    values: [1, 2],
                },
                {
                    fieldId: 'orders_discount_percent',
                    fieldType: DimensionType.NUMBER,
                    fieldFilterType: FilterType.NUMBER,
                    operator: FilterOperator.NOT_EQUALS,
                    values: [0],
                },
            )}`,
        ),
    commonNumberFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.LESS_THAN),
                    z.literal(FilterOperator.LESS_THAN_OR_EQUAL),
                    z.literal(FilterOperator.GREATER_THAN),
                    z.literal(FilterOperator.GREATER_THAN_OR_EQUAL),
                ])
                .describe(
                    'Use for threshold comparisons such as greater than 100.',
                ),
            values: z
                .array(z.number())
                .length(1)
                .describe('Exactly one numeric threshold value.'),
        })
        .describe(
            `Use for numeric fields with a single comparison threshold. ${filterJsonExamples(
                {
                    fieldId: 'orders_total_revenue',
                    fieldType: MetricType.SUM,
                    fieldFilterType: FilterType.NUMBER,
                    operator: FilterOperator.GREATER_THAN,
                    values: [1000],
                },
                {
                    fieldId: 'orders_discount_percent',
                    fieldType: DimensionType.NUMBER,
                    fieldFilterType: FilterType.NUMBER,
                    operator: FilterOperator.LESS_THAN_OR_EQUAL,
                    values: [0.15],
                },
            )}`,
        ),
    commonNumberFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.IN_BETWEEN),
                    z.literal(FilterOperator.NOT_IN_BETWEEN),
                ])
                .describe('Use for ranges between two numeric bounds.'),
            values: z
                .array(z.number())
                .length(2)
                .describe('Exactly two numeric bounds: [lower, upper].'),
        })
        .describe(
            `Use for numeric fields inside or outside a two-value range. ${filterJsonExamples(
                {
                    fieldId: 'orders_total_revenue',
                    fieldType: MetricType.SUM,
                    fieldFilterType: FilterType.NUMBER,
                    operator: FilterOperator.IN_BETWEEN,
                    values: [100, 500],
                },
                {
                    fieldId: 'orders_margin_percent',
                    fieldType: DimensionType.NUMBER,
                    fieldFilterType: FilterType.NUMBER,
                    operator: FilterOperator.NOT_IN_BETWEEN,
                    values: [0.2, 0.4],
                },
            )}`,
        ),
]);

export default numberFilterSchema;
