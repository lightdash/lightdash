import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_GET_FIELDS_DESCRIPTION = `Tool: getFields

Purpose:
Fetch exact fields from exact explores by field id. Use this when you already know the field id(s) you likely want to use and need exact full field context before final selection or query construction.

Usage tips:
- This is not a search tool. Use findExplores/findFields when you are still discovering or comparing candidates.
- Use getFields when you are fairly sure a metric or dimension should be used and want exact details for that known field id.
- Pass exact field ids returned by findExplores, findFields, query errors, or other semantic-layer tools.
- Never infer field ids from labels or desired concepts (for example, do not guess "orders_country" or "airports_city"). If the exact field id was not returned by a tool, call findFields first.
- Pass multiple fields in one request only when each field is likely relevant to the final answer.
- Do not use this to fetch broad field inventories; use findExplores/findFields for search and only fetch exact fields that matter.
- Results are returned per field. If one field cannot be resolved, other valid fields are still returned.

Output:
- Full untruncated field details for each resolved field.
- Per-field errors for missing explores or field ids.
`;

const toolGetFieldsRequestSchema = z.object({
    explore: z.string().describe('Exact explore name that contains the field.'),
    fieldId: z
        .string()
        .describe('Exact field id to fetch, e.g. "orders_total_revenue".'),
});

export const toolGetFieldsArgsSchema = createToolSchema()
    .extend({
        fields: z
            .array(toolGetFieldsRequestSchema)
            .min(1)
            .describe('Fields to fetch by exact explore name and field id.'),
    })
    .build();

export const toolGetFieldsArgsSchemaTransformed = toolGetFieldsArgsSchema;

export const getFieldsMetadataSchema = z.object({
    fields: z.array(
        z.object({
            explore: z.string(),
            fieldId: z.string(),
            status: z.enum(['success', 'error']),
        }),
    ),
});

export const toolGetFieldsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema.extend({
        lookup: getFieldsMetadataSchema.optional(),
    }),
});

export type ToolGetFieldsArgs = z.infer<typeof toolGetFieldsArgsSchema>;
export type ToolGetFieldsArgsTransformed = ToolGetFieldsArgs;
export type ToolGetFieldsOutput = z.infer<typeof toolGetFieldsOutputSchema>;
