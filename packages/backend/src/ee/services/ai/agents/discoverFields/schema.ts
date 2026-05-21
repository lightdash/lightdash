import { z } from 'zod';

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

const exploreSummarySchema = z.object({
    name: z.string(),
    label: z.string(),
    baseTable: z.string(),
    joinedTables: z.array(z.string()),
});

const fieldSummarySchema = z.object({
    fieldId: z.string().describe('The fieldId to use in runQuery payloads.'),
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
    isFromJoinedTable: z.boolean(),
    description: z
        .string()
        .nullable()
        .describe(
            'Short description, only include when needed to distinguish similar fields.',
        ),
});

const candidateSchema = z.object({
    exploreName: z.string(),
    exploreLabel: z.string(),
    reason: z
        .string()
        .describe('Why this explore is a plausible candidate for the query.'),
});

const discoverFieldsUnion = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('resolved'),
        explore: exploreSummarySchema,
        fields: z
            .array(fieldSummarySchema)
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
            .array(candidateSchema)
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
    handoff: discoverFieldsUnion,
});

export type DiscoverFieldsResult = z.infer<typeof discoverFieldsUnion>;
