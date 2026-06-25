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

const discoverFieldsExploreSummarySchema = z.object({
    name: z.string(),
    label: z.string(),
    baseTable: z.string(),
    joinedTables: z.array(z.string()),
    requiredFilters: z
        .array(
            z.object({
                fieldId: z.string(),
                fieldRef: z.string(),
                tableName: z.string(),
                operator: z.string(),
                values: z.array(z.unknown()).optional(),
                settings: z.unknown().optional(),
                required: z.boolean(),
            }),
        )
        .optional()
        .describe(
            'Explore-level required/default filters from findExplores. Only include when findExplores returned requiredFilters for the selected explore.',
        ),
});

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
    caseSensitiveFilters: z
        .enum(['true', 'false', 'not_applicable'])
        .describe(
            'Use "true" or "false" only when the exact selected findFields result explicitly includes caseSensitiveFilters with that value; otherwise use "not_applicable".',
        ),
    isFromJoinedTable: z.boolean(),
    description: z
        .string()
        .nullable()
        .describe(
            'Full field description copied exactly from listFields when fetched, otherwise a non-truncated findFields description; null when the field has no description.',
        ),
});

const discoverFieldsDimensionSummarySchema =
    discoverFieldsFieldSummaryBaseSchema.extend({
        fieldType: z.literal('dimension'),
    });

const discoverFieldsMetricSummarySchema =
    discoverFieldsFieldSummaryBaseSchema.extend({
        fieldType: z.literal('metric'),
    });

const discoverFieldsFieldSummarySchema = z.union([
    discoverFieldsDimensionSummarySchema,
    discoverFieldsMetricSummarySchema,
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

export const discoverFieldsResultUnionSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('resolved'),
        explore: discoverFieldsExploreSummarySchema,
        dimensions: z
            .array(discoverFieldsDimensionSummarySchema)
            .describe(
                'Filtered list of dimension fields relevant to the user query: groupings, dates, filters, and breakdowns. Not the full explore.',
            ),
        metrics: z
            .array(discoverFieldsMetricSummarySchema)
            .describe(
                'Filtered list of metric fields relevant to the user query. Not the full explore.',
            ),
        fields: z
            .array(discoverFieldsFieldSummarySchema)
            .describe(
                'Legacy combined list of selected dimensions and metrics. Prefer dimensions and metrics for new consumers.',
            ),
        rationale: z
            .string()
            .nullable()
            .describe('Brief justification for the explore + field selection.'),
        uncertainties: discoverFieldsUncertaintiesSchema,
    }),
    z.object({
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
    }),
    z.object({
        status: z.literal('no_match'),
        reason: z
            .string()
            .describe(
                'Why no explore covers the user query — used by the parent to explain back to the user.',
            ),
        uncertainties: discoverFieldsUncertaintiesSchema,
    }),
]);

export const discoverFieldsResultSchema = z.object({
    handoff: discoverFieldsResultUnionSchema,
});

export const toolDiscoverFieldsOutputSchema = z.union([
    z.object({
        result: z.string(),
        metadata: z.object({
            status: z.literal('success'),
            discovery: discoverFieldsResultUnionSchema,
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
