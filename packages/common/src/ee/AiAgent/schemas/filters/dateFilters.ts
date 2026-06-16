import { z } from 'zod';
import { DimensionType, MetricType } from '../../../../types/field';
import {
    FilterOperator,
    FilterType,
    UnitOfTime,
} from '../../../../types/filter';
import { getFieldIdSchema } from '../fieldId';
import {
    datePresenceOperatorDescription,
    filterJsonExamples,
    filterOperatorList,
} from './filterDescriptionUtils';

const dateOrDateTimeSchema = z
    .union([z.string().date(), z.string().datetime()])
    .describe(
        'ISO date (YYYY-MM-DD) or ISO datetime. Do not use relative phrases like "last 2 weeks" here.',
    );

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
    commonDateFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.NULL),
                    z.literal(FilterOperator.NOT_NULL),
                ])
                .describe(datePresenceOperatorDescription),
        })
        .describe(
            `Use for date/timestamp fields when checking if a value is missing or present. Do not include values. ${filterJsonExamples(
                {
                    fieldId: 'orders_order_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.NULL,
                },
                {
                    fieldId: 'orders_created_at',
                    fieldType: DimensionType.TIMESTAMP,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.NOT_NULL,
                },
            )}`,
        ),
    commonDateFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.EQUALS),
                    z.literal(FilterOperator.NOT_EQUALS),
                ])
                .describe(
                    `Use ${filterOperatorList(FilterOperator.EQUALS, FilterOperator.NOT_EQUALS)} for explicit dates or datetimes.`,
                ),
            values: z
                .array(dateOrDateTimeSchema)
                .describe('One or more explicit ISO dates/datetimes.'),
        })
        .describe(
            `Use for specific dates like 2024-01-01. For relative periods like "last 2 weeks", use ${FilterOperator.IN_THE_PAST}. ${filterJsonExamples(
                {
                    fieldId: 'orders_order_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.EQUALS,
                    values: ['2024-01-01'],
                },
                {
                    fieldId: 'orders_created_at',
                    fieldType: DimensionType.TIMESTAMP,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.NOT_EQUALS,
                    values: ['2024-01-01T00:00:00Z'],
                },
            )}`,
        ),
    commonDateFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.IN_THE_PAST),
                    z.literal(FilterOperator.NOT_IN_THE_PAST),
                    z.literal(FilterOperator.IN_THE_NEXT),
                    // NOTE: NOT_IN_THE_NEXT is not supported...
                ])
                .describe(
                    `Use ${FilterOperator.IN_THE_PAST} for last/past N periods, ${FilterOperator.IN_THE_NEXT} for next N periods, ${FilterOperator.NOT_IN_THE_PAST} to exclude recent periods.`,
                ),
            values: z
                .array(z.number())
                .length(1)
                .describe('Exactly one positive number of periods, e.g. [2].'),
            settings: z
                .object({
                    completed: z
                        .boolean()
                        .describe(
                            'false for rolling periods including the current partial period; true for completed periods only.',
                        ),
                    unitOfTime: z
                        .union([
                            z.literal(UnitOfTime.days),
                            z.literal(UnitOfTime.weeks),
                            z.literal(UnitOfTime.months),
                            z.literal(UnitOfTime.quarters),
                            z.literal(UnitOfTime.years),
                        ])
                        .describe('Period unit for the relative date filter.'),
                })
                .describe('Relative period settings.'),
        })
        .describe(
            `Use for relative date requests such as "last 2 weeks" or "next 3 months". ${filterJsonExamples(
                {
                    fieldId: 'orders_order_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.IN_THE_PAST,
                    values: [2],
                    settings: {
                        completed: false,
                        unitOfTime: UnitOfTime.weeks,
                    },
                },
                {
                    fieldId: 'orders_order_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.IN_THE_PAST,
                    values: [3],
                    settings: {
                        completed: true,
                        unitOfTime: UnitOfTime.months,
                    },
                },
                {
                    fieldId: 'orders_ship_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.IN_THE_NEXT,
                    values: [14],
                    settings: {
                        completed: false,
                        unitOfTime: UnitOfTime.days,
                    },
                },
                {
                    fieldId: 'orders_order_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.NOT_IN_THE_PAST,
                    values: [7],
                    settings: {
                        completed: false,
                        unitOfTime: UnitOfTime.days,
                    },
                },
            )}`,
        ),
    commonDateFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.IN_THE_CURRENT),
                    z.literal(FilterOperator.NOT_IN_THE_CURRENT),
                ])
                .describe(
                    'Use for this/current period or to exclude this/current period.',
                ),
            values: z
                .array(z.literal(1))
                .length(1)
                .describe('Always [1] for current-period filters.'),
            settings: z
                .object({
                    completed: z
                        .literal(false)
                        .describe('Always false for current-period filters.'),
                    unitOfTime: z
                        .union([
                            z.literal(UnitOfTime.days),
                            z.literal(UnitOfTime.weeks),
                            z.literal(UnitOfTime.months),
                            z.literal(UnitOfTime.quarters),
                            z.literal(UnitOfTime.years),
                        ])
                        .describe(
                            'Current period unit, e.g. weeks for this week.',
                        ),
                })
                .describe('Current-period settings.'),
        })
        .describe(
            `Use for current date requests such as "today", "this week", "this month", or "this year". ${filterJsonExamples(
                {
                    fieldId: 'orders_order_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.IN_THE_CURRENT,
                    values: [1],
                    settings: {
                        completed: false,
                        unitOfTime: UnitOfTime.days,
                    },
                },
                {
                    fieldId: 'orders_order_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.NOT_IN_THE_CURRENT,
                    values: [1],
                    settings: {
                        completed: false,
                        unitOfTime: UnitOfTime.months,
                    },
                },
            )}`,
        ),
    commonDateFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.LESS_THAN),
                    z.literal(FilterOperator.LESS_THAN_OR_EQUAL),
                    z.literal(FilterOperator.GREATER_THAN),
                    z.literal(FilterOperator.GREATER_THAN_OR_EQUAL),
                ])
                .describe(
                    'Use for before/after comparisons against one explicit date or datetime.',
                ),
            values: z
                .array(dateOrDateTimeSchema)
                .length(1)
                .describe('Exactly one explicit ISO date/datetime threshold.'),
        })
        .describe(
            `Use for date/timestamp fields before, on-or-before, after, or on-or-after a specific date. ${filterJsonExamples(
                {
                    fieldId: 'orders_order_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                    values: ['2024-01-01'],
                },
                {
                    fieldId: 'orders_created_at',
                    fieldType: DimensionType.TIMESTAMP,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.LESS_THAN,
                    values: ['2024-02-01T00:00:00Z'],
                },
            )}`,
        ),
    commonDateFilterRuleSchema
        .extend({
            operator: z
                .literal(FilterOperator.IN_BETWEEN)
                .describe(
                    'Use for explicit date ranges between two dates/datetimes.',
                ),
            values: z
                .array(dateOrDateTimeSchema)
                .length(2)
                .describe(
                    'Exactly two explicit ISO dates/datetimes: [start, end].',
                ),
        })
        .describe(
            `Use for explicit date ranges such as from 2024-01-01 to 2024-01-31. ${filterJsonExamples(
                {
                    fieldId: 'orders_order_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2024-01-01', '2024-01-31'],
                },
                {
                    fieldId: 'orders_created_at',
                    fieldType: DimensionType.TIMESTAMP,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.IN_BETWEEN,
                    values: ['2024-01-01T00:00:00Z', '2024-01-31T23:59:59Z'],
                },
            )}`,
        ),
]);

export default dateFilterSchema;
