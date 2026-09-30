import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { toolNameFor } from './discoveryToolNames';
import { findExploresRelevantVerifiedAnswerSchema } from './toolFindExploresArgs';

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
    verified: z.boolean().describe('Whether the field has a verified marker.'),
});

const grepFieldsPatternExploreSchema = z.object({
    exploreName: z.string(),
    exploreLabel: z.string(),
    requiredFilters: z
        .array(
            z.object({
                fieldId: z.string(),
                operator: z.string(),
                values: z.array(z.unknown()).optional(),
                required: z.boolean(),
            }),
        )
        .describe(
            'Required or suggested table filters printed for this explore.',
        ),
    fields: z.array(grepFieldsPatternFieldSchema),
});

const grepFieldsExploreNameMatchSchema = z.object({
    exploreName: z.string(),
    exploreLabel: z.string(),
});

const grepFieldsPatternResultBaseSchema = z.object({
    pattern: z.string(),
    matchCount: z.number().describe('Fields matched before the display cap.'),
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

const grepFieldsPatternResultSchema = z.union([
    grepFieldsPatternResultBaseSchema.extend({
        status: z.enum(['matches', 'no_matches']),
    }),
    grepFieldsPatternResultBaseSchema.extend({
        status: z
            .literal('no_signal')
            .describe(
                'The pattern matched every field in scope and was discarded.',
            ),
        scopeSize: z.number().describe('Fields the pattern was run against.'),
        matchedAllFields: z.literal(true),
    }),
]);

const grepFieldsFuzzyMatchSchema = z.object({
    fieldId: z.string(),
    label: z.string(),
    fieldType: z.string(),
    description: z.string().nullable().optional(),
    verified: z.boolean().optional(),
});

export const toolGrepFieldsStructuredContentSchema = z.object({
    preloadedMetadata: z
        .string()
        .nullable()
        .describe('The exact preloaded catalog metadata appended to the text.'),
    review: z
        .string()
        .nullable()
        .describe(
            'The exact ambiguity warnings or empty-result diagnosis in the text.',
        ),
    patterns: z
        .array(grepFieldsPatternResultSchema)
        .describe(
            'One entry per input pattern, in input order; empty when the requested explore is unavailable.',
        ),
    fuzzyMatches: z
        .array(grepFieldsFuzzyMatchSchema)
        .describe(
            'Catalog-search near matches not already surfaced by the grep.',
        ),
    relevantVerifiedAnswers: z
        .array(findExploresRelevantVerifiedAnswerSchema)
        .optional(),
});

export const grepFieldsResultSchema =
    toolGrepFieldsStructuredContentSchema.extend({
        scope: z
            .string()
            .optional()
            .describe(
                'The exact scope label appended to the MCP response text.',
            ),
    });

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
