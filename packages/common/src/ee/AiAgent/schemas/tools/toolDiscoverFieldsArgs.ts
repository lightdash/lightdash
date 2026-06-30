import { z } from 'zod';

export const DISCOVER_FIELDS_DESCRIPTION = `Tool: discoverFields

Purpose:
Run the data-discovery subagent. Given the latest user query, returns a structured handoff describing which explore, dimensions, and metrics to use to answer it.

Use this tool as the FIRST step whenever the user asks a data question (counts, totals, breakdowns, trends, "what is", "show me", "how many"). Do NOT call this when the user is only asking about existing dashboards/charts (use findContent) or follow-up clarifications about a chart you already produced.

You will receive one of three statuses:
- "resolved" — proceed with generateVisualization (or generateDashboard) using the returned explore + dimensions/metrics.
- "ambiguous" — surface the suggestedQuestion to the user; do NOT call generateVisualization.
- "no_match" — explain back to the user that no data source covers the request.

Re-call this tool if the user pivots mid-thread to a different data topic and you need fields from a different explore.
`;

export const discoverFieldsInputSchema = z.object({
    userQuery: z
        .string()
        .describe(
            'The latest user question or instruction the agent is responding to. Pass the full message — the subagent uses it to disambiguate explores and rank fields.',
        ),
    agentInstruction: z
        .string()
        .nullable()
        .describe(
            "The agent's configured `instruction` field if present, otherwise null. Provides domain-specific guidance for explore/field selection.",
        ),
});

export type DiscoverFieldsInput = z.infer<typeof discoverFieldsInputSchema>;

const requiredFilterSchema = z.object({
    fieldId: z.string(),
    fieldRef: z.string(),
    tableName: z.string(),
    operator: z.string(),
    values: z.array(z.unknown()).optional(),
    settings: z.unknown().optional(),
    required: z.boolean(),
});

const requiredFiltersDescription =
    'Explore-level required/default filters for the selected explore. Respect these when constructing queries; empty when the explore has none.';

const discoverFieldsExploreSummarySchemaBase = z.object({
    name: z.string(),
    label: z.string(),
    baseTable: z.string(),
    joinedTables: z.array(z.string()),
});

export const discoverFieldsExploreSummarySchemaV1 =
    discoverFieldsExploreSummarySchemaBase.extend({
        requiredFilters: z
            .array(requiredFilterSchema)
            .optional()
            .describe(requiredFiltersDescription),
    });

export const discoverFieldsExploreSummarySchemaV2 =
    discoverFieldsExploreSummarySchemaBase.extend({
        requiredFilters: z
            .array(requiredFilterSchema)
            .describe(requiredFiltersDescription),
    });

const caseSensitiveFiltersDescription =
    'String dimension filter case-sensitivity. true means exact-case matching, false means case-insensitive matching, and null means not applicable.';

const discoverFieldsFieldSummaryBaseSchema = z.object({
    fieldId: z
        .string()
        .describe('The fieldId to use in generateVisualization payloads.'),
    name: z.string(),
    label: z.string(),
    table: z.string(),
    fieldValueType: z
        .string()
        .describe(
            'The value type (e.g. number, string, date, timestamp, boolean).',
        ),
    fieldFilterType: z.string(),
    isFromJoinedTable: z.boolean(),
    description: z
        .string()
        .nullable()
        .describe(
            'Full, non-truncated field description from discovery metadata; null when the field has no description.',
        ),
});

const discoverFieldsFieldSummaryBaseSchemaV1 =
    discoverFieldsFieldSummaryBaseSchema.extend({
        caseSensitiveFilters: z
            .enum(['true', 'false', 'not_applicable'])
            .describe(
                'Use "true" or "false" only when the exact selected findFields result explicitly includes caseSensitiveFilters with that value; otherwise use "not_applicable".',
            ),
    });

const discoverFieldsFieldSummaryBaseSchemaV2 =
    discoverFieldsFieldSummaryBaseSchema.extend({
        caseSensitiveFilters: z
            .boolean()
            .nullable()
            .describe(caseSensitiveFiltersDescription),
    });

const discoverFieldsDimensionSummarySchemaV1 =
    discoverFieldsFieldSummaryBaseSchemaV1.extend({
        fieldType: z.literal('dimension'),
    });

const discoverFieldsMetricSummarySchemaV1 =
    discoverFieldsFieldSummaryBaseSchemaV1.extend({
        fieldType: z.literal('metric'),
    });

const discoverFieldsFieldSummarySchemaV1 = z.union([
    discoverFieldsDimensionSummarySchemaV1,
    discoverFieldsMetricSummarySchemaV1,
]);

const discoverFieldsDimensionSummarySchemaV2 =
    discoverFieldsFieldSummaryBaseSchemaV2.extend({
        fieldType: z.literal('dimension'),
    });

const discoverFieldsMetricSummarySchemaV2 =
    discoverFieldsFieldSummaryBaseSchemaV2.extend({
        fieldType: z.literal('metric'),
    });

const discoverFieldsFieldSummarySchemaV2 = z.union([
    discoverFieldsDimensionSummarySchemaV2,
    discoverFieldsMetricSummarySchemaV2,
]);

const discoverFieldsCandidateSchema = z.object({
    exploreName: z.string(),
    exploreLabel: z.string(),
    reason: z
        .string()
        .describe('Why this explore is a plausible candidate for the query.'),
});

const discoverFieldsUncertaintiesSchema = z
    .string()
    .nullable()
    .describe(
        'Free-form uncertainties or caveats encountered during discovery. Null when selection was straightforward.',
    );

const getDiscoverFieldsResolvedResultSchema = <
    TExploreSchema extends z.ZodTypeAny,
    TDimensionSchema extends z.ZodTypeAny,
    TMetricSchema extends z.ZodTypeAny,
    TFieldSchema extends z.ZodTypeAny,
>({
    exploreSchema,
    dimensionSchema,
    metricSchema,
    fieldSchema,
}: {
    exploreSchema: TExploreSchema;
    dimensionSchema: TDimensionSchema;
    metricSchema: TMetricSchema;
    fieldSchema: TFieldSchema;
}) =>
    z.object({
        status: z.literal('resolved'),
        explore: exploreSchema,
        dimensions: z
            .array(dimensionSchema)
            .describe(
                'Filtered list of dimension fields relevant to the user query: groupings, dates, filters, and breakdowns. Not the full explore.',
            ),
        metrics: z
            .array(metricSchema)
            .describe(
                'Filtered list of metric fields relevant to the user query. Not the full explore.',
            ),
        fields: z
            .array(fieldSchema)
            .describe(
                'Legacy combined list of selected dimensions and metrics. Prefer dimensions and metrics for new consumers.',
            ),
        rationale: z
            .string()
            .nullable()
            .describe('Brief justification for the explore + field selection.'),
        uncertainties: discoverFieldsUncertaintiesSchema,
    });

const discoverFieldsResolvedResultSchemaV1 =
    getDiscoverFieldsResolvedResultSchema({
        exploreSchema: discoverFieldsExploreSummarySchemaV1,
        dimensionSchema: discoverFieldsDimensionSummarySchemaV1,
        metricSchema: discoverFieldsMetricSummarySchemaV1,
        fieldSchema: discoverFieldsFieldSummarySchemaV1,
    });

const discoverFieldsResolvedResultSchemaV2 =
    getDiscoverFieldsResolvedResultSchema({
        exploreSchema: discoverFieldsExploreSummarySchemaV2,
        dimensionSchema: discoverFieldsDimensionSummarySchemaV2,
        metricSchema: discoverFieldsMetricSummarySchemaV2,
        fieldSchema: discoverFieldsFieldSummarySchemaV2,
    });

const discoverFieldsAmbiguousResultSchema = z.object({
    status: z.literal('ambiguous'),
    candidates: z
        .array(discoverFieldsCandidateSchema)
        .min(2)
        .describe(
            'Plausible explores the parent should ask the user to disambiguate between.',
        ),
    suggestedQuestion: z
        .string()
        .describe(
            "A clarification question the parent can echo to the user (e.g. 'Did you mean revenue from the orders explore or the payments explore?').",
        ),
    uncertainties: discoverFieldsUncertaintiesSchema,
});

const discoverFieldsNoMatchResultSchema = z.object({
    status: z.literal('no_match'),
    reason: z
        .string()
        .describe(
            'Why no explore covers the user query — used by the parent to explain back to the user.',
        ),
    uncertainties: discoverFieldsUncertaintiesSchema,
});

export const discoverFieldsResultUnionSchemaV1 = z.discriminatedUnion(
    'status',
    [
        discoverFieldsResolvedResultSchemaV1,
        discoverFieldsAmbiguousResultSchema,
        discoverFieldsNoMatchResultSchema,
    ],
);

export const discoverFieldsResultUnionSchemaV2 = z.discriminatedUnion(
    'status',
    [
        discoverFieldsResolvedResultSchemaV2,
        discoverFieldsAmbiguousResultSchema,
        discoverFieldsNoMatchResultSchema,
    ],
);

export const discoverFieldsResultUnionSchema =
    discoverFieldsResultUnionSchemaV2;

const discoverFieldsResultUnionSchemaBackwardCompatible = z.union([
    discoverFieldsResolvedResultSchemaV2,
    discoverFieldsResolvedResultSchemaV1,
    discoverFieldsAmbiguousResultSchema,
    discoverFieldsNoMatchResultSchema,
]);

export const discoverFieldsResultSchema = z.object({
    handoff: discoverFieldsResultUnionSchema,
});

export const toolDiscoverFieldsOutputSchema = z.union([
    z.object({
        result: z.string(),
        metadata: z.object({
            status: z.literal('success'),
            discovery: discoverFieldsResultUnionSchemaBackwardCompatible,
        }),
    }),
    z.object({
        result: z.string(),
        metadata: z.object({
            status: z.literal('error'),
        }),
    }),
]);

export type DiscoverFieldsResult = z.infer<
    typeof discoverFieldsResultUnionSchema
>;
export type ToolDiscoverFieldsOutput = z.infer<
    typeof toolDiscoverFieldsOutputSchema
>;
