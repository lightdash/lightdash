import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_INSPECT_EXPLORE_DESCRIPTION = `Tool: inspectExplore

Purpose:
Lists available Explores along with their fields, joined tables, hints for you (Ai Hints) and descriptions.

Usage Tips:
- Use this to understand the structure of an Explore.
- Only a subset of fields is returned, use the next page token to retrieve additional pages.
`;

export const toolInspectExploreArgsSchema = createToolSchema(
    'inspect_explore',
    TOOL_INSPECT_EXPLORE_DESCRIPTION,
)
    .extend({
        exploreName: z
            .string()
            .describe(
                'Name of the table to focus on. If omitted, all tables are returned. For a single table, all dimensions, metrics, and full descriptions are loaded',
            ),
    })
    .withPagination()
    .build();

export type ToolInspectExploreArgs = z.infer<
    typeof toolInspectExploreArgsSchema
>;

export const toolInspectExploreArgsSchemaTransformed =
    toolInspectExploreArgsSchema;

export type ToolInspectExploreArgsTransformed = ToolInspectExploreArgs;
