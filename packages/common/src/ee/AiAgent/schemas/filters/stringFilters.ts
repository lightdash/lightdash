import { z } from 'zod';
import { DimensionType, MetricType } from '../../../../types/field';
import { FilterOperator, FilterType } from '../../../../types/filter';
import { getFieldIdSchema } from '../fieldId';
import {
    filterJsonExamples,
    filterOperatorList,
    valuePresenceOperatorDescription,
} from './filterDescriptionUtils';

const commonStringFilterRuleSchema = z.object({
    fieldId: getFieldIdSchema({ additionalDescription: null }),
    fieldType: z.union([
        z.literal(DimensionType.STRING),
        z.literal(MetricType.STRING),
    ]),
    fieldFilterType: z.literal(FilterType.STRING),
});

const stringFilterSchema = z.union([
    commonStringFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.NULL),
                    z.literal(FilterOperator.NOT_NULL),
                ])
                .describe(valuePresenceOperatorDescription),
        })
        .describe(
            `Use for string fields when checking if a value is missing or present. Do not include values. ${filterJsonExamples(
                {
                    fieldId: 'orders_status',
                    fieldType: DimensionType.STRING,
                    fieldFilterType: FilterType.STRING,
                    operator: FilterOperator.NULL,
                },
                {
                    fieldId: 'orders_status',
                    fieldType: DimensionType.STRING,
                    fieldFilterType: FilterType.STRING,
                    operator: FilterOperator.NOT_NULL,
                },
            )}`,
        ),
    commonStringFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.EQUALS),
                    z.literal(FilterOperator.NOT_EQUALS),
                    z.literal(FilterOperator.STARTS_WITH),
                    z.literal(FilterOperator.ENDS_WITH),
                    z.literal(FilterOperator.INCLUDE),
                    z.literal(FilterOperator.NOT_INCLUDE),
                ])
                .describe(
                    `${filterOperatorList(FilterOperator.EQUALS, FilterOperator.NOT_EQUALS)} for exact matches; ${filterOperatorList(FilterOperator.INCLUDE, FilterOperator.NOT_INCLUDE)} for contains; ${filterOperatorList(FilterOperator.STARTS_WITH, FilterOperator.ENDS_WITH)} for prefixes/suffixes.`,
                ),
            values: z
                .array(z.string())
                .describe(
                    'String values to match. Do not put natural-language date ranges here.',
                ),
        })
        .describe(
            `Use for text matching on string fields. For dates like "last 2 weeks", use a date filter instead. ${filterJsonExamples(
                {
                    fieldId: 'orders_status',
                    fieldType: DimensionType.STRING,
                    fieldFilterType: FilterType.STRING,
                    operator: FilterOperator.EQUALS,
                    values: ['complete', 'paid'],
                },
                {
                    fieldId: 'customers_email',
                    fieldType: DimensionType.STRING,
                    fieldFilterType: FilterType.STRING,
                    operator: FilterOperator.INCLUDE,
                    values: ['@lightdash.com'],
                },
                {
                    fieldId: 'products_sku',
                    fieldType: DimensionType.STRING,
                    fieldFilterType: FilterType.STRING,
                    operator: FilterOperator.STARTS_WITH,
                    values: ['SKU-'],
                },
                {
                    fieldId: 'orders_status',
                    fieldType: DimensionType.STRING,
                    fieldFilterType: FilterType.STRING,
                    operator: FilterOperator.NOT_EQUALS,
                    values: ['cancelled'],
                },
            )}`,
        ),
]);

export default stringFilterSchema;
