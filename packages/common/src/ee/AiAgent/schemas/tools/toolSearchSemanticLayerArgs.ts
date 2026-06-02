import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_SEARCH_SEMANTIC_LAYER_DESCRIPTION = `Tool: searchSemanticLayer

Purpose:
Search or list metrics and dimensions across the ENTIRE semantic layer (every explore at once). Use this for project-wide questions that are NOT scoped to a single explore, for example:
- "what metrics do we have?"
- "find duplicate or confusingly similar metrics"
- "audit / inventory the semantic layer"
- "which explores define a 'revenue' metric?"

Unlike findFields (which requires a specific explore) and findExplores (a keyword search over explores), this tool returns a flat, paginated inventory of fields drawn from all explores, so you can compare definitions across the whole project without enumerating explores one by one.

Parameters:
- searchQuery: Optional keyword to full-text search field names, labels and descriptions. Leave null/empty to list the full inventory.
- type: Optional filter — "metric" or "dimension". Leave null to return both.
- page: Page number for pagination (starts at 1). The result reports total counts so you know how many pages remain.

Output:
- A paginated list of fields, each with: explore (exploreName), name, label, fieldType (metric/dimension), description and chart usage count.
`;

export const toolSearchSemanticLayerArgsSchema = createToolSchema()
    .extend({
        searchQuery: z
            .string()
            .nullable()
            .describe(
                'Optional keyword to search field names, labels and descriptions across all explores. Leave null or empty to return the full inventory of fields.',
            ),
        type: z
            .enum(['metric', 'dimension'])
            .nullable()
            .describe(
                'Optional filter to return only metrics or only dimensions. Leave null to return both.',
            ),
    })
    .withPagination()
    .build();

export const searchSemanticLayerRankingMetadataSchema = z.object({
    searchQuery: z.string().nullable(),
    type: z.enum(['metric', 'dimension']).nullable(),
    fields: z.array(
        z.object({
            name: z.string(),
            label: z.string(),
            tableName: z.string(),
            fieldType: z.string(),
            searchRank: z.number().nullable().optional(),
            chartUsage: z.number().nullable().optional(),
        }),
    ),
});

export const toolSearchSemanticLayerOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema.extend({
        ranking: searchSemanticLayerRankingMetadataSchema.optional(),
    }),
});

export type ToolSearchSemanticLayerArgs = z.infer<
    typeof toolSearchSemanticLayerArgsSchema
>;
export type ToolSearchSemanticLayerArgsTransformed =
    ToolSearchSemanticLayerArgs;
export type ToolSearchSemanticLayerOutput = z.infer<
    typeof toolSearchSemanticLayerOutputSchema
>;
