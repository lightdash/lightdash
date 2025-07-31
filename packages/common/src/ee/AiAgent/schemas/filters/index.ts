import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import type { FilterRule, Filters } from '../../../../types/filter';
import assertUnreachable from '../../../../utils/assertUnreachable';
import { getFieldIdSchema } from '../fieldId';
import booleanFilterSchema from './booleanFilters';
import dateFilterSchema from './dateFilters';
import numberFilterSchema from './numberFilters';
import stringFilterSchema from './stringFilters';

const filterRuleTypeSchema = z
    .enum(['date', 'timestamp', 'number', 'string', 'boolean'])
    .describe('"fieldFilterType" of the field');

const filterRuleSchema = z.object({
    type: z.enum(['or', 'and']).describe('Type of filter group operation'),
    target: z.object({
        fieldId: getFieldIdSchema({ additionalDescription: null }),
        type: filterRuleTypeSchema,
    }),
    rule: z
        .union([
            booleanFilterSchema.describe('Boolean filter'),
            stringFilterSchema.describe('String filter'),
            numberFilterSchema.describe('Number filter'),
            dateFilterSchema.describe('Date filter'),
        ])
        .describe(
            'Filter rule for the field. You can only select filter rules that match the "fieldFilterType" type specified in the field details.',
        ),
});

const filterRuleSchemaTransformed = filterRuleSchema.transform(
    (data): FilterRule => ({
        id: uuid(),
        target: data.target,
        operator: data.rule.operator,
        values: 'values' in data.rule ? data.rule.values : [],
        ...('settings' in data.rule ? { settings: data.rule.settings } : {}),
    }),
);

export const filtersSchema = z.object({
    type: z.enum(['and', 'or']).describe('Type of filter group operation'),
    dimensions: z.array(filterRuleSchema).nullable(),
    metrics: z.array(filterRuleSchema).nullable(),
});

const filtersSchemaAndFilterRulesTransformed = z
    .object({
        type: z.enum(['and', 'or']).describe('Type of filter group operation'),
        dimensions: z.array(filterRuleSchemaTransformed).nullable(),
        metrics: z.array(filterRuleSchemaTransformed).nullable(),
    })
    // Filters can be null
    .nullable();

export const filtersSchemaTransformed =
    filtersSchemaAndFilterRulesTransformed.transform((data): Filters => {
        if (!data) {
            return {
                dimensions: { id: uuid(), and: [] },
                metrics: { id: uuid(), and: [] },
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
                };
            default:
                return assertUnreachable(data.type, 'Invalid filter type');
        }
    });
