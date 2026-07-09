import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { toolNameFor } from './discoveryToolNames';
import {
    findExploresRelevantVerifiedAnswerSchema,
    findExploresRequiredFilterSchema,
} from './toolFindExploresArgs';

export const GREP_FIELDS_DESCRIPTION = ({
    runtime,
}: ToolDescriptionContext): string => {
    const grepFields = toolNameFor('grepFields', runtime);
    const findContent = toolNameFor('findContent', runtime);
    return `Tool: ${grepFields}

Purpose:
Find which explores and fields can answer a question by grepping an in-memory, annotated view of the project's fields (names, labels, descriptions, hints and tags). Returns matching fields as \`explore/fieldId  [kind type]\` lines grouped by explore.

Use this as the FIRST step whenever the user asks a data question (counts, totals, breakdowns, trends, "what is", "show me", "how many"). Do NOT call this for questions about existing dashboards/charts (use ${findContent}).

Each pattern is a case-insensitive keyword pattern (not a full regex): use \`|\` to OR synonyms ("revenue|sales") and a space or \`.*\` between words to require all of them ("order.*status" matches fields mentioning both "order" and "status"). Pass 1–5 patterns in a SINGLE call covering the different angles of the question — they run together so you see all results at once instead of grepping one at a time. Start broad with meaningful keywords (e.g. ["revenue|sales", "country|region", "segment|tier"]) and narrow from there — long natural-language phrases will not match. If results are empty, try synonyms or broader patterns before giving up. Read the returned fieldIds and pick the single explore that answers at the right grain before building a query.
`;
};

export const grepFieldsInputSchema = z.object({
    patterns: z
        .array(z.string().min(1))
        .min(1)
        .max(5)
        .describe(
            'Up to 5 case-insensitive keyword patterns, run together in one call. Use `|` to OR synonyms and a space or `.*` between words to require all of them. Each is matched against field names, labels, descriptions, hints and tags.',
        ),
    exploreName: z
        .string()
        .nullable()
        .describe(
            'Restrict the search to this explore only, or null to search all explores.',
        ),
});

export type ToolGrepFieldsArgs = z.infer<typeof grepFieldsInputSchema>;

// Per-pattern match stats, persisted with the tool result so grep quality is
// observable in production. `matchedAllFields` is the fingerprint of a
// too-broad or broken grep (the pattern discriminated nothing in its scope).
export const grepFieldsPatternStatsSchema = z.array(
    z.object({
        pattern: z.string(),
        matchCount: z.number(),
        scopeSize: z.number(),
        matchedAllFields: z.boolean(),
    }),
);

const grepFieldsPatternFieldSchema = z.object({
    exploreName: z.string(),
    exploreLabel: z.string(),
    fieldId: z.string(),
    path: z.string(),
    kind: z.enum(['dimension', 'metric']),
    fieldType: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    hint: z.string().nullable(),
    usageInVerifiedCharts: z.number(),
    matchLocality: z.enum(['name', 'description', 'hint', 'mixed']),
});

const grepFieldsPatternExploreSchema = z.object({
    exploreName: z.string(),
    exploreLabel: z.string(),
    requiredFilters: z.array(findExploresRequiredFilterSchema),
    fields: z.array(grepFieldsPatternFieldSchema),
});

const grepFieldsExploreNameMatchSchema = z.object({
    exploreName: z.string(),
    exploreLabel: z.string(),
});

const grepFieldsPatternResultSchema = z.object({
    pattern: z.string(),
    status: z.enum(['matches', 'no_matches', 'no_signal']),
    matchCount: z.number(),
    scopeSize: z.number(),
    matchedAllFields: z.boolean(),
    note: z.string(),
    resultsByExplore: z.array(grepFieldsPatternExploreSchema),
    metricAmbiguityNote: z.string().nullable(),
    matchingExploresByName: z.array(grepFieldsExploreNameMatchSchema),
});

const grepFieldsFuzzyMatchSchema = z.object({
    exploreName: z.string(),
    fieldId: z.string(),
    label: z.string(),
    fieldType: z.string(),
    description: z.string().nullable(),
    searchRank: z.number().nullable(),
    usageInCharts: z.number(),
    usageInVerifiedCharts: z.number(),
});

export const grepFieldsResultSchema = z.object({
    description: z.string(),
    exploreName: z.string().nullable(),
    patterns: z.array(grepFieldsPatternResultSchema),
    fuzzyMatches: z.array(grepFieldsFuzzyMatchSchema),
    relevantVerifiedAnswers: z
        .array(findExploresRelevantVerifiedAnswerSchema)
        .optional(),
});

export const toolGrepFieldsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema.extend({
        patternStats: grepFieldsPatternStatsSchema.optional(),
    }),
});

export type GrepFieldsResult = z.infer<typeof grepFieldsResultSchema>;
export type ToolGrepFieldsOutput = z.infer<typeof toolGrepFieldsOutputSchema>;
