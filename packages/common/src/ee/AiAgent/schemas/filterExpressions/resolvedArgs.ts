import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import type { FilterGroup, Filters } from '../../../../types/filter';
import assertUnreachable from '../../../../utils/assertUnreachable';
import {
    customMetricsSchema,
    customMetricsSchemaTransformed,
} from '../customMetrics';
import {
    filterRuleSchema,
    filterRuleSchemaTransformed,
    filtersSchemaTransformed,
    filtersSchemaV2,
    numberFilterSchema,
} from '../filters';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import {
    chartConfigSchema,
    mergeConfigSchema,
    queryConfigBaseSchema,
} from '../tools/toolRunQueryArgs';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';

// Persistence-only schemas for the server-resolved data of filter-expression
// queries. Each query category (dimensions, metrics, tableCalculations) owns
// an independent FilterGroup, so categories may resolve to different
// connectors — which the legacy shared-connector filters object
// (filtersSchemaV2's single `type`) cannot represent. The V2 shape below
// carries one connector per category. Resolved data emitted before this shape
// existed (and resolved data whose categories agree) uses the legacy object,
// so parsers accept both. None of this is advertised to models; the model
// contract stays the flat expression strings in expressionSchemas.

const resolvedConnectorSchema = z.union([z.literal('and'), z.literal('or')]);

const resolvedFilterGroupSchema = z
    .object({
        connector: resolvedConnectorSchema,
        rules: z.array(filterRuleSchema).min(1),
    })
    .strict();

const resolvedNumberFilterGroupSchema = z
    .object({
        connector: resolvedConnectorSchema,
        rules: z.array(numberFilterSchema).min(1),
    })
    .strict();

// These versions describe persisted filter shapes, independently from the
// run-query tool schema versions. The historical filtersSchemaV2 tool shape is
// V1 here; its required root `type` distinguishes it from V2.
export const filterExpressionResolvedFiltersSchemaV1 = filtersSchemaV2;

export const filterExpressionResolvedFiltersSchemaV2 = z
    .object({
        dimensions: resolvedFilterGroupSchema.nullable(),
        metrics: resolvedFilterGroupSchema.nullable(),
        tableCalculations: resolvedNumberFilterGroupSchema.nullable(),
    })
    .strict();

export const filterExpressionResolvedFiltersSchema = z.union([
    filterExpressionResolvedFiltersSchemaV2,
    filterExpressionResolvedFiltersSchemaV1,
]);

export type FilterExpressionResolvedFiltersV1 = z.infer<
    typeof filterExpressionResolvedFiltersSchemaV1
>;
export type FilterExpressionResolvedFiltersV2 = z.infer<
    typeof filterExpressionResolvedFiltersSchemaV2
>;
export type FilterExpressionResolvedFilters = z.infer<
    typeof filterExpressionResolvedFiltersSchema
>;

const resolvedFilterGroupTransformed = z
    .object({
        connector: resolvedConnectorSchema,
        rules: z.array(filterRuleSchemaTransformed).min(1),
    })
    .strict();

type ResolvedFilterGroupTransformed = z.infer<
    typeof resolvedFilterGroupTransformed
>;

const toFilterGroup = (
    group: ResolvedFilterGroupTransformed | null,
): FilterGroup => {
    if (group === null) return { id: uuid(), and: [] };
    switch (group.connector) {
        case 'and':
            return { id: uuid(), and: group.rules };
        case 'or':
            return { id: uuid(), or: group.rules };
        default:
            return assertUnreachable(
                group.connector,
                'Invalid resolved filter connector',
            );
    }
};

const filterExpressionResolvedFiltersSchemaV1Transformed =
    filtersSchemaTransformed;

const filterExpressionResolvedFiltersSchemaV2Transformed = z
    .object({
        dimensions: resolvedFilterGroupTransformed.nullable(),
        metrics: resolvedFilterGroupTransformed.nullable(),
        tableCalculations: resolvedFilterGroupTransformed.nullable(),
    })
    .strict()
    .transform(
        (data): Filters => ({
            dimensions: toFilterGroup(data.dimensions),
            metrics: toFilterGroup(data.metrics),
            tableCalculations: toFilterGroup(data.tableCalculations),
        }),
    );

// Try the current per-category V2 shape first, then the historical
// shared-connector V1 shape. The V1 parser remains last because it also accepts
// null. Both normalize to domain Filters without Explore metadata or a feature
// flag.
export const filterExpressionResolvedFiltersSchemaTransformed = z.union([
    filterExpressionResolvedFiltersSchemaV2Transformed,
    filterExpressionResolvedFiltersSchemaV1Transformed,
]);

const resolvedQueryConfigSchema = queryConfigBaseSchema.extend({
    customMetrics: customMetricsSchema,
    tableCalculations: tableCalcsSchema,
    filters: filterExpressionResolvedFiltersSchema.nullable(),
});

const resolvedMergeSourceQueryConfigSchema = resolvedQueryConfigSchema.omit({
    limit: true,
    parameters: true,
    tableCalculations: true,
});

const resolvedMergeConfigSchema = mergeConfigSchema.unwrap().extend({
    additionalSources: z
        .array(
            z.object({
                id: z.string().min(1),
                queryConfig: resolvedMergeSourceQueryConfigSchema,
            }),
        )
        .length(1),
});

// Superset of toolRunQueryArgsSchemaPersisted (V3): identical except filters
// additionally accept the V1 per-category shape, so every previously
// persisted resolved payload keeps parsing unchanged.
export const toolRunQueryExpressionResolvedArgsSchema = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        queryConfig: resolvedQueryConfigSchema,
        chartConfig: chartConfigSchema,
        mergeConfig: resolvedMergeConfigSchema.nullable().default(null),
    })
    .build();

export type ToolRunQueryExpressionResolvedArgs = z.infer<
    typeof toolRunQueryExpressionResolvedArgsSchema
>;

const resolvedQueryConfigInternalSchema = queryConfigBaseSchema.extend({
    customMetrics: customMetricsSchemaTransformed,
    tableCalculations: tableCalcsSchema,
    filters: filterExpressionResolvedFiltersSchemaTransformed,
});

const resolvedMergeSourceQueryConfigInternalSchema =
    resolvedQueryConfigInternalSchema.omit({
        limit: true,
        parameters: true,
        tableCalculations: true,
    });

const resolvedMergeConfigInternalSchema = mergeConfigSchema.unwrap().extend({
    additionalSources: z
        .array(
            z.object({
                id: z.string().min(1),
                queryConfig: resolvedMergeSourceQueryConfigInternalSchema,
            }),
        )
        .length(1),
});

const runQueryResolvedInternalSchema = z.object({
    ...visualizationMetadataSchema.shape,
    queryConfig: resolvedQueryConfigInternalSchema,
    chartConfig: chartConfigSchema.default(null),
    mergeConfig: resolvedMergeConfigInternalSchema.nullable().default(null),
});

// Same internal output shape as toolRunQueryArgsSchemaTransformed, with
// per-category connectors preserved in the domain Filters.
export const toolRunQueryExpressionResolvedArgsSchemaTransformed: z.ZodPipeline<
    typeof toolRunQueryExpressionResolvedArgsSchema,
    typeof runQueryResolvedInternalSchema
> = toolRunQueryExpressionResolvedArgsSchema.pipe(
    runQueryResolvedInternalSchema,
);

export type ToolRunQueryExpressionResolvedArgsTransformed = z.infer<
    typeof toolRunQueryExpressionResolvedArgsSchemaTransformed
>;
