import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_LOAD_PROJECT_CONTEXT_DESCRIPTION =
    'Load the project business context: curated acronyms, definitions, rules and conventions that are NOT in the field metadata. Call this BEFORE findExplores/findFields/discoverFields — it can change which explore, field, or filter value you should use. Treat what it returns as authoritative over your own assumptions. Pass `patterns` to load only the entries relevant to your question (recommended); omit to load the entire context.';

export const toolLoadProjectContextArgsSchema = z.object({
    patterns: z
        .array(z.string().min(1))
        .max(5)
        .optional()
        .describe(
            "Up to 5 case-insensitive keyword patterns; only context entries matching them are loaded. Use `|` to OR synonyms and a space or `.*` between words to require all of them; matched against each entry's id, terms, referenced objects and content. Omit to load the entire project context.",
        ),
});

export const toolLoadProjectContextOutputSchema = z.object({
    result: z.string(),
    // Telemetry stamped onto the stored tool result: which entries were loaded
    // and their approximate token cost.
    metadata: baseOutputMetadataSchema.extend({
        entryIds: z.array(z.string()).optional(),
        approxTokens: z.number().optional(),
    }),
});

export type ToolLoadProjectContextArgs = z.infer<
    typeof toolLoadProjectContextArgsSchema
>;
export type ToolLoadProjectContextOutput = z.infer<
    typeof toolLoadProjectContextOutputSchema
>;
