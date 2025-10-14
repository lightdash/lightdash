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

const filterAndOrSchema = z
    .union([z.literal('and'), z.literal('or')])
    .describe('Type of filter group operation');

const filterRuleSchema = z.union([
    booleanFilterSchema,
    stringFilterSchema,
    numberFilterSchema,
    dateFilterSchema,
]);

export type AiFilterRule = FilterRule<
    FilterOperator,
    { fieldId: string; fieldFilterType: FilterType }
>;

const filterRuleSchemaTransformed = filterRuleSchema.transform(
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

// TODO: deprecate this in 2 weeks
const filtersSchemaV1 = z.object({
    type: filterAndOrSchema,
    dimensions: z.array(filterRuleSchema).nullable(),
    metrics: z.array(filterRuleSchema).nullable(),
});

export const filtersSchemaV2 = filtersSchemaV1.extend({
    tableCalculations: z.array(numberFilterSchema).nullable(),
});

const filtersSchemaAndFilterRulesTransformedV1 = z.object({
    type: filterAndOrSchema,
    dimensions: z.array(filterRuleSchemaTransformed).nullable(),
    metrics: z.array(filterRuleSchemaTransformed).nullable(),
});

const filtersSchemaAndFilterRulesTransformedV2 =
    filtersSchemaAndFilterRulesTransformedV1.extend({
        tableCalculations: z.array(filterRuleSchemaTransformed).nullable(),
    });

const filtersSchemaAndFilterRulesTransformed = z
    .union([
        filtersSchemaAndFilterRulesTransformedV2,
        filtersSchemaAndFilterRulesTransformedV1,
    ])
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
                        and:
                            'tableCalculations' in data
                                ? data.tableCalculations ?? []
                                : [],
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
                        or:
                            'tableCalculations' in data
                                ? data.tableCalculations ?? []
                                : [],
                    },
                };
            default:
                return assertUnreachable(data.type, 'Invalid filter type');
        }
    });
