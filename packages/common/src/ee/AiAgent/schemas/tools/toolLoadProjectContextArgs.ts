import { z } from 'zod';
import {
    aiProjectContextObjectRefSchema,
    aiProjectContextTypedObjectRefSchema,
    projectContextEntryKinds,
} from '../../projectContext';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_LOAD_PROJECT_CONTEXT_DESCRIPTION =
    'Load the project business context: curated acronyms, definitions, rules and conventions that are NOT in the field metadata. Call this BEFORE grepFields — it can change which explore, field, or filter value you should use. Treat what it returns as authoritative over your own assumptions. Pass `patterns` to load only the entries relevant to your question (recommended); omit to load the entire context.';

export const toolLoadProjectContextArgsSchema = z.object({
    patterns: z
        .array(z.string().min(1))
        .max(5)
        .optional()
        .describe(
            "Up to 5 case-insensitive keyword patterns; only context entries matching them are loaded. Use `|` to OR synonyms and a space or `.*` between words to require all of them; matched against each entry's id, terms, referenced objects and content. Omit to load the entire project context.",
        ),
});

const contextEntryInventorySchema = z.object({
    id: z.string(),
    source: z
        .literal('context')
        .describe('Curated project context; authoritative over assumptions.'),
    kind: z.enum(projectContextEntryKinds),
    terms: z
        .array(z.string())
        .describe('Search terms the entry is matched on.'),
});

const memoryEntryInventorySchema = z.object({
    id: z.string(),
    source: z
        .literal('memory')
        .describe(
            'Past-conversation memory; verify against the current catalog.',
        ),
    scope: z.enum(['user', 'project']),
    ageDays: z.number().describe('Days since the memory was recorded.'),
    objects: z
        .array(aiProjectContextTypedObjectRefSchema)
        .describe('Explores and fields the memory refers to.'),
    terms: z
        .array(z.string())
        .describe('Search terms the memory is matched on.'),
});

const loadedContextEntrySchema = contextEntryInventorySchema.extend({
    objects: z
        .array(aiProjectContextObjectRefSchema)
        .describe(
            'Explores and fields the entry refers to; legacy entries use plain strings.',
        ),
    content: z.string(),
});

const loadedMemoryEntrySchema = memoryEntryInventorySchema
    .omit({ terms: true })
    .extend({ content: z.string() });

export const toolLoadProjectContextStructuredContentSchema =
    z.discriminatedUnion('outcome', [
        z.object({
            outcome: z
                .literal('loaded')
                .describe(
                    'Entries were loaded; empty when no project context is configured.',
                ),
            entries: z.array(
                z.discriminatedUnion('source', [
                    loadedContextEntrySchema,
                    loadedMemoryEntrySchema,
                ]),
            ),
        }),
        z.object({
            outcome: z
                .literal('no_match')
                .describe(
                    'Patterns matched nothing; `available` lists every entry (without content) to re-grep against.',
                ),
            totalEntries: z.number(),
            available: z.array(
                z.discriminatedUnion('source', [
                    contextEntryInventorySchema,
                    memoryEntryInventorySchema,
                ]),
            ),
        }),
    ]);

export const toolLoadProjectContextOutputSchema = structuredToolOutputSchema({
    // Telemetry stamped onto the stored tool result: which entries were loaded
    // and their approximate token cost.
    metadata: baseOutputMetadataSchema.extend({
        entryIds: z.array(z.string()).optional(),
        approxTokens: z.number().optional(),
    }),
    structuredContent: toolLoadProjectContextStructuredContentSchema,
});

export type ToolLoadProjectContextArgs = z.infer<
    typeof toolLoadProjectContextArgsSchema
>;
export type ToolLoadProjectContextStructuredContent = z.infer<
    typeof toolLoadProjectContextStructuredContentSchema
>;
export type ToolLoadProjectContextOutput = z.infer<
    typeof toolLoadProjectContextOutputSchema
>;
