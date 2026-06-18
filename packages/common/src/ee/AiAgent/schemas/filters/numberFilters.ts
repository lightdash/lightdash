import { z } from 'zod';
import { DimensionType, MetricType } from '../../../../types/field';
import { FilterOperator, FilterType } from '../../../../types/filter';
import { getFieldIdSchema } from '../fieldId';
import {
    filterOperatorList,
    valuePresenceOperatorDescription,
} from './filterDescriptionUtils';
import { filterJsonExamplesForOperators } from './filterExamples';

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
            `Use for numeric fields when checking if a value is missing or present. Do not include values. ${filterJsonExamplesForOperators(
                {
                    fieldId: 'orders_total_revenue',
                    fieldType: MetricType.SUM,
                    fieldFilterType: FilterType.NUMBER,
                    operators: [FilterOperator.NULL, FilterOperator.NOT_NULL],
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
            `Use for numeric fields that equal or exclude specific values. ${filterJsonExamplesForOperators(
                {
                    fieldId: 'orders_item_count',
                    fieldType: MetricType.COUNT,
                    fieldFilterType: FilterType.NUMBER,
                    operators: [
                        FilterOperator.EQUALS,
                        FilterOperator.NOT_EQUALS,
                    ],
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
            `Use for numeric fields with a single comparison threshold. ${filterJsonExamplesForOperators(
                {
                    fieldId: 'orders_total_revenue',
                    fieldType: MetricType.SUM,
                    fieldFilterType: FilterType.NUMBER,
                    operators: [
                        FilterOperator.LESS_THAN,
                        FilterOperator.LESS_THAN_OR_EQUAL,
                        FilterOperator.GREATER_THAN,
                        FilterOperator.GREATER_THAN_OR_EQUAL,
                    ],
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
            `Use for numeric fields inside or outside a two-value range. ${filterJsonExamplesForOperators(
                {
                    fieldId: 'orders_total_revenue',
                    fieldType: MetricType.SUM,
                    fieldFilterType: FilterType.NUMBER,
                    operators: [
                        FilterOperator.IN_BETWEEN,
                        FilterOperator.NOT_IN_BETWEEN,
                    ],
                },
            )}`,
        ),
]);

export default numberFilterSchema;
