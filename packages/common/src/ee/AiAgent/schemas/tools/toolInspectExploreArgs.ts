import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_INSPECT_EXPLORE_DESCRIPTION = `Tool: inspectExplore
Main instruction: Inspect the specified explore to view information on joined tables, hints for you (Ai Hints), descriptions, and lists of metrics and dimensions.
Output format: Includes joined tables, hints, descriptions, metrics, and dimensions (only a subset; use next page token to fetch more fields).
Usage tips:
- Use to understand an Explore's structure.
- Retrieve additional metrics and dimensions using the next page token.`;

export const toolInspectExploreArgsSchema = createToolSchema(
    'inspect_explore',
    TOOL_INSPECT_EXPLORE_DESCRIPTION,
)
    .extend({
        exploreName: z.string().describe('Name of the table to inspect'),
    })
    .withPagination()
    .build();

export type ToolInspectExploreArgs = z.infer<
    typeof toolInspectExploreArgsSchema
>;

export const toolInspectExploreArgsSchemaTransformed =
    toolInspectExploreArgsSchema;

export type ToolInspectExploreArgsTransformed = ToolInspectExploreArgs;
