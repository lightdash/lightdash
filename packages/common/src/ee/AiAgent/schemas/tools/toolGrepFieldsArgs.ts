import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
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
    const getMetadata = toolNameFor('getMetadata', runtime);
    return `Tool: ${grepFields}

Purpose:
Find which explores and fields can answer a question by grepping an in-memory, annotated view of the project's fields (names, labels, descriptions, hints and tags). Returns matching fields as \`explore/fieldId  [kind type]\` lines grouped by explore.

Use this as the FIRST step whenever the user asks a data question (counts, totals, breakdowns, trends, "what is", "show me", "how many"). Do NOT call this for questions about existing dashboards/charts (use ${findContent}).

Each pattern is a case-insensitive keyword pattern (not a full regex): use \`|\` to OR synonyms ("revenue|sales") and a space or \`.*\` between words to require all of them ("order.*status" matches fields mentioning both "order" and "status"). Pass 1–5 patterns in a SINGLE call covering the different angles of the question — they run together so you see all results at once instead of grepping one at a time. Start broad with meaningful keywords (e.g. ["revenue|sales", "country|region", "segment|tier"]) and narrow from there — long natural-language phrases will not match. If results are empty, try synonyms or broader patterns before giving up. Read the returned fieldIds and pick the single explore that answers at the right grain before building a query.

A description or hint ending in "...(truncated)" is incomplete — call ${getMetadata} to read the full text before using that field.

A field annotated with \`⚠params: <names>\` depends on those Lightdash parameters — what it returns changes with the parameter values the query runs with (unset parameters resolve to their default). Call ${getMetadata} on its explore to see the parameter definitions before querying such a field.
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
    fieldId: z.string().describe('Field id to use in queries.'),
    path: z.string().describe('`exploreName/fieldId`, as printed in `result`.'),
    kind: z.enum(['dimension', 'metric']),
    fieldType: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    hint: z.string().nullable().describe('The field aiHint, if any.'),
    defaultTimeDimension: z
        .string()
        .nullable()
        .describe('Time dimension the metric defaults to, if configured.'),
    defaultTimeDimensionGranularity: z.string().nullable(),
    requiredParameters: z
        .array(z.string())
        .describe('Lightdash parameters this field depends on.'),
    usageInVerifiedCharts: z
        .number()
        .describe('How many verified saved charts use this field.'),
    matchLocality: z
        .enum(['name', 'description', 'hint', 'mixed'])
        .describe(
            'Which slice of the field the pattern matched, most specific first.',
        ),
});

const grepFieldsPatternExploreSchema = z.object({
    exploreName: z.string(),
    exploreLabel: z.string(),
    requiredFilters: z
        .array(findExploresRequiredFilterSchema)
        .describe('Filters that must be set when querying this explore.'),
    fields: z.array(grepFieldsPatternFieldSchema),
});

const grepFieldsExploreNameMatchSchema = z.object({
    exploreName: z.string(),
    exploreLabel: z.string(),
});

const grepFieldsPatternResultSchema = z.object({
    pattern: z.string(),
    status: z
        .enum(['matches', 'no_matches', 'no_signal'])
        .describe(
            '`no_signal` means the pattern matched every field in scope and was discarded.',
        ),
    matchCount: z.number().describe('Fields matched before the display cap.'),
    scopeSize: z.number().describe('Fields the pattern was run against.'),
    matchedAllFields: z.boolean(),
    note: z.string().describe('The per-pattern summary line.'),
    resultsByExplore: z
        .array(grepFieldsPatternExploreSchema)
        .describe('Matched fields grouped by explore, best matches first.'),
    metricAmbiguityNote: z
        .string()
        .nullable()
        .describe('Warning when similarly named metrics could be confused.'),
    matchingExploresByName: z
        .array(grepFieldsExploreNameMatchSchema)
        .describe(
            'Explores whose own name/label/hint matched but had no field matches.',
        ),
});

const grepFieldsFuzzyMatchSchema = z.object({
    exploreName: z.string(),
    fieldId: z.string(),
    label: z.string(),
    fieldType: z.string(),
    description: z.string().nullable(),
    searchRank: z
        .number()
        .nullable()
        .describe('Full-text search rank; higher is better.'),
    usageInCharts: z.number(),
    usageInVerifiedCharts: z.number(),
});

export const toolGrepFieldsStructuredContentSchema = z.object({
    description: z
        .string()
        .describe('How to read `patterns` and `fuzzyMatches`.'),
    exploreName: z
        .string()
        .nullable()
        .describe('The explore the grep was scoped to, or null for all.'),
    patterns: z
        .array(grepFieldsPatternResultSchema)
        .describe('One entry per input pattern, in input order.'),
    fuzzyMatches: z
        .array(grepFieldsFuzzyMatchSchema)
        .describe(
            'Catalog-search near matches not already surfaced by the grep.',
        ),
    relevantVerifiedAnswers: z
        .array(findExploresRelevantVerifiedAnswerSchema)
        .optional(),
});

export const grepFieldsResultSchema = toolGrepFieldsStructuredContentSchema;

export const toolGrepFieldsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema.extend({
        patternStats: grepFieldsPatternStatsSchema.optional(),
    }),
    structuredContent: toolGrepFieldsStructuredContentSchema,
});

export type ToolGrepFieldsStructuredContent = z.infer<
    typeof toolGrepFieldsStructuredContentSchema
>;
export type GrepFieldsResult = z.infer<typeof grepFieldsResultSchema>;
export type ToolGrepFieldsOutput = z.infer<typeof toolGrepFieldsOutputSchema>;
