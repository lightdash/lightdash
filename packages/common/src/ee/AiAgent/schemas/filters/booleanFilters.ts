import { z } from 'zod';
import { DimensionType, MetricType } from '../../../../types/field';
import { FilterOperator, FilterType } from '../../../../types/filter';
import { getFieldIdSchema } from '../fieldId';
import {
    filterJsonExamples,
    filterOperatorList,
    valuePresenceOperatorDescription,
} from './filterDescriptionUtils';

const commonBooleanFilterRuleSchema = z.object({
    fieldId: getFieldIdSchema({ additionalDescription: null }),
    fieldType: z.union([
        z.literal(DimensionType.BOOLEAN),
        z.literal(MetricType.BOOLEAN),
    ]),
    fieldFilterType: z.literal(FilterType.BOOLEAN),
});

const booleanFilterSchema = z.union([
    commonBooleanFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.NULL),
                    z.literal(FilterOperator.NOT_NULL),
                ])
                .describe(valuePresenceOperatorDescription),
        })
        .describe(
            `Use for boolean fields when checking if a value is missing or present. Do not include values. ${filterJsonExamples(
                {
                    fieldId: 'users_is_active',
                    fieldType: DimensionType.BOOLEAN,
                    fieldFilterType: FilterType.BOOLEAN,
                    operator: FilterOperator.NULL,
                },
                {
                    fieldId: 'users_is_active',
                    fieldType: DimensionType.BOOLEAN,
                    fieldFilterType: FilterType.BOOLEAN,
                    operator: FilterOperator.NOT_NULL,
                },
            )}`,
        ),
    commonBooleanFilterRuleSchema
        .extend({
            operator: z
                .union([
                    z.literal(FilterOperator.EQUALS),
                    z.literal(FilterOperator.NOT_EQUALS),
                ])
                .describe(
                    `Use ${filterOperatorList(FilterOperator.EQUALS, FilterOperator.NOT_EQUALS)} to match true or false.`,
                ),
            values: z
                .array(z.boolean())
                .length(1)
                .describe('Exactly one boolean value, e.g. [true] or [false].'),
        })
        .describe(
            `Use for boolean fields when matching or excluding true/false values. ${filterJsonExamples(
                {
                    fieldId: 'users_is_active',
                    fieldType: DimensionType.BOOLEAN,
                    fieldFilterType: FilterType.BOOLEAN,
                    operator: FilterOperator.EQUALS,
                    values: [true],
                },
                {
                    fieldId: 'users_is_active',
                    fieldType: DimensionType.BOOLEAN,
                    fieldFilterType: FilterType.BOOLEAN,
                    operator: FilterOperator.NOT_EQUALS,
                    values: [false],
                },
            )}`,
        ),
]);

export default booleanFilterSchema;
