import { z } from 'zod';

export const DISCOVER_FIELDS_DESCRIPTION = `Tool: discoverFields

Purpose:
Run the data-discovery subagent. Given the latest user query, returns a structured handoff describing which explore and which fields to use to answer it.

Use this tool as the FIRST step whenever the user asks a data question (counts, totals, breakdowns, trends, "what is", "show me", "how many"). Do NOT call this when the user is only asking about existing dashboards/charts (use findContent) or follow-up clarifications about a chart you already produced.

You will receive one of three statuses:
- "resolved" — proceed with generateVisualization (or generateDashboard) using the returned explore + fields.
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
});

const discoverFieldsFieldSummarySchema = z.object({
    fieldId: z
        .string()
        .describe('The fieldId to use in generateVisualization payloads.'),
    name: z.string(),
    label: z.string(),
    table: z.string(),
    fieldType: z.enum(['dimension', 'metric']),
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
            'Field description copied from findFields only when it is not truncated and needed to distinguish similar fields; null otherwise.',
        ),
});

const discoverFieldsCandidateSchema = z.object({
    exploreName: z.string(),
    exploreLabel: z.string(),
    reason: z
        .string()
        .describe('Why this explore is a plausible candidate for the query.'),
});

export const discoverFieldsResultUnionSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('resolved'),
        explore: discoverFieldsExploreSummarySchema,
        fields: z
            .array(discoverFieldsFieldSummarySchema)
            .describe(
                'Filtered list of fields relevant to the user query — typically 5–20 entries. Not the full explore.',
            ),
        rationale: z
            .string()
            .nullable()
            .describe('Brief justification for the explore + field selection.'),
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
    }),
    z.object({
        status: z.literal('no_match'),
        reason: z
            .string()
            .describe(
                'Why no explore covers the user query — used by the parent to explain back to the user.',
            ),
    }),
]);

export const discoverFieldsResultSchema = z.object({
    handoff: discoverFieldsResultUnionSchema,
});

export const toolDiscoverFieldsOutputSchema = z.union([
    z.object({
        result: z.literal(''),
        metadata: z.object({
            status: z.literal('streaming'),
            streamingMessage: z.unknown(),
        }),
    }),
    z.object({
        result: z.string(),
        metadata: z.object({
            status: z.literal('success'),
            discovery: discoverFieldsResultUnionSchema,
            streamingMessage: z.unknown().optional(),
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
