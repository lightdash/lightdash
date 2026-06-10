import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_LOAD_PROJECT_CONTEXT_DESCRIPTION =
    'Load the project business context: curated acronyms, definitions, rules and conventions that are NOT in the field metadata. Call this BEFORE findExplores/findFields/discoverFields — it can change which explore, field, or filter value you should use. Treat what it returns as authoritative over your own assumptions.';

// The whole project context is loaded wholesale, so the tool takes no args.
export const toolLoadProjectContextArgsSchema = z.object({});

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
