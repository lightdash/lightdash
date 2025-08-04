import { z } from 'zod';
import { DimensionType, MetricType } from '../../../../types/field';
import {
    FilterOperator,
    FilterType,
    UnitOfTime,
} from '../../../../types/filter';
import { getFieldIdSchema } from '../fieldId';

const dateOrDateTimeSchema = z.union([
    z.string().date(),
    z.string().datetime(),
]);

const commonDateFilterRuleSchema = z.object({
    fieldId: getFieldIdSchema({ additionalDescription: null }),
    fieldType: z.union([
        z.literal(DimensionType.DATE),
        z.literal(DimensionType.TIMESTAMP),
        z.literal(MetricType.DATE),
        z.literal(MetricType.TIMESTAMP),
    ]),
    fieldFilterType: z.literal(FilterType.DATE),
});

const dateFilterSchema = z.union([
    commonDateFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.NULL),
            z.literal(FilterOperator.NOT_NULL),
        ]),
    }),
    commonDateFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.EQUALS),
            z.literal(FilterOperator.NOT_EQUALS),
        ]),
        values: z.array(dateOrDateTimeSchema),
    }),
    commonDateFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.IN_THE_PAST),
            z.literal(FilterOperator.NOT_IN_THE_PAST),
            z.literal(FilterOperator.IN_THE_NEXT),
            // NOTE: NOT_IN_THE_NEXT is not supported...
        ]),
        values: z.array(z.number()).length(1),
        settings: z.object({
            completed: z.boolean(),
            unitOfTime: z.union([
                z.literal(UnitOfTime.days),
                z.literal(UnitOfTime.weeks),
                z.literal(UnitOfTime.months),
                z.literal(UnitOfTime.quarters),
                z.literal(UnitOfTime.years),
            ]),
        }),
    }),
    commonDateFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.IN_THE_CURRENT),
            z.literal(FilterOperator.NOT_IN_THE_CURRENT),
        ]),
        values: z.array(z.literal(1)).length(1),
        settings: z.object({
            completed: z.literal(false),
            unitOfTime: z.union([
                z.literal(UnitOfTime.days),
                z.literal(UnitOfTime.weeks),
                z.literal(UnitOfTime.months),
                z.literal(UnitOfTime.quarters),
                z.literal(UnitOfTime.years),
            ]),
        }),
    }),
    commonDateFilterRuleSchema.extend({
        operator: z.union([
            z.literal(FilterOperator.LESS_THAN),
            z.literal(FilterOperator.LESS_THAN_OR_EQUAL),
            z.literal(FilterOperator.GREATER_THAN),
            z.literal(FilterOperator.GREATER_THAN_OR_EQUAL),
        ]),
        values: z.array(dateOrDateTimeSchema).length(1),
    }),
    commonDateFilterRuleSchema.extend({
        operator: z.literal(FilterOperator.IN_BETWEEN),
        values: z.array(dateOrDateTimeSchema).length(2),
    }),
]);

export default dateFilterSchema;
