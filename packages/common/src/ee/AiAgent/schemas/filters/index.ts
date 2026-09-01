import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import type {
    FilterOperator,
    FilterRule,
    Filters,
    FilterType,
} from '../../../../types/filter';
import assertUnreachable from '../../../../utils/assertUnreachable';
import booleanFilterSchema from './booleanFilters';
import dateFilterSchema from './dateFilters';
import numberFilterSchema from './numberFilters';
import stringFilterSchema from './stringFilters';

export {
    booleanFilterSchema,
    dateFilterSchema,
    numberFilterSchema,
    stringFilterSchema,
};
export * from './filterExamples';

const filterAndOrSchema = z
    .union([z.literal('and'), z.literal('or')])
    .describe('Type of filter group operation');

export const filterRuleSchema = z.union([
    booleanFilterSchema,
    stringFilterSchema,
    numberFilterSchema,
    dateFilterSchema,
]);

export type AiFilterRule = FilterRule<
    FilterOperator,
    { fieldId: string; fieldFilterType: FilterType }
>;

export const filterRuleSchemaTransformed = filterRuleSchema.transform(
    (data): AiFilterRule => ({
        id: uuid(),
        target: {
            fieldId: data.fieldId,
            fieldFilterType: data.fieldFilterType,
        },
        operator: data.operator,
        values: 'values' in data ? data.values : [],
        ...('settings' in data ? { settings: data.settings } : {}),
    }),
);

const optionalNullableArray = <T extends z.ZodType>(itemSchema: T) =>
    z.preprocess(
        (value) => (value === null ? undefined : value),
        z.array(itemSchema).optional(),
    );

export const filtersSchemaV2 = z.object({
    type: filterAndOrSchema,
    dimensions: z.array(filterRuleSchema).nullable(),
    metrics: z.array(filterRuleSchema).nullable(),
    tableCalculations: z.array(numberFilterSchema).nullable(),
});

export const filtersSchemaV2ModelInput = filtersSchemaV2.extend({
    dimensions: optionalNullableArray(filterRuleSchema),
    metrics: optionalNullableArray(filterRuleSchema),
    tableCalculations: optionalNullableArray(numberFilterSchema),
});

const filtersSchemaAndFilterRulesTransformed = z
    .object({
        type: filterAndOrSchema,
        dimensions: z.array(filterRuleSchemaTransformed).nullish(),
        metrics: z.array(filterRuleSchemaTransformed).nullish(),
        tableCalculations: z.array(filterRuleSchemaTransformed).nullish(),
    })
    .nullable();

export const filtersSchemaTransformed =
    filtersSchemaAndFilterRulesTransformed.transform((data): Filters => {
        if (!data) {
            return {
                dimensions: { id: uuid(), and: [] },
                metrics: { id: uuid(), and: [] },
                tableCalculations: { id: uuid(), and: [] },
            };
        }
        switch (data.type) {
            case 'and':
                return {
                    dimensions: {
                        id: uuid(),
                        and: data.dimensions ?? [],
                    },
                    metrics: {
                        id: uuid(),
                        and: data.metrics ?? [],
                    },
                    tableCalculations: {
                        id: uuid(),
                        and: data.tableCalculations ?? [],
                    },
                };
            case 'or':
                return {
                    dimensions: {
                        id: uuid(),
                        or: data.dimensions ?? [],
                    },
                    metrics: {
                        id: uuid(),
                        or: data.metrics ?? [],
                    },
                    tableCalculations: {
                        id: uuid(),
                        or: data.tableCalculations ?? [],
                    },
                };
            default:
                return assertUnreachable(data.type, 'Invalid filter type');
        }
    });
