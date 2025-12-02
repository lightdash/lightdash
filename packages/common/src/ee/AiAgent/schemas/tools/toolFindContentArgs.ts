import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FIND_CONTENT_DESCRIPTION = `Tool: "findContent"
Purpose:
Finds charts or dashboards by name or description within a project, returning detailed information about each.

Usage tips:
- IMPORTANT: Pass the user's full query or relevant portion directly (e.g., "revenue based on campaigns" instead of just "campaigns").
- The search engine understands natural language and context — more descriptive queries yield better results.
- You can provide multiple search queries to look for different topics simultaneously (e.g., ["monthly revenue", "user acquisition trends"]).
- If results aren't relevant, retry with the full user query or more specific terms.
- Dashboards with validation errors will be deprioritized.
- Returns chart and dashboard URLs when available.
- It doesn't provide summaries for dashboards yet, so don't suggest this capability.`;

export const toolFindContentArgsSchema = createToolSchema({
    description: TOOL_FIND_CONTENT_DESCRIPTION,
})
    .extend({
        searchQueries: z.array(
            z.object({
                label: z
                    .string()
                    .describe(
                        'Full search query from the user (e.g., "revenue based on campaigns" not just "campaigns"). Include full context for better results.',
                    ),
            }),
        ),
    })
    .build();

export const toolFindContentArgsSchemaTransformed = toolFindContentArgsSchema;

export const toolFindContentOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolFindContentArgs = z.infer<typeof toolFindContentArgsSchema>;
export type ToolFindContentArgsTransformed = ToolFindContentArgs;
export type ToolFindContentOutput = z.infer<typeof toolFindContentOutputSchema>;
