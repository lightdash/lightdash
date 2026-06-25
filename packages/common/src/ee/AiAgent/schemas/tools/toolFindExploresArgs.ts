import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const requiredFilterSchema = z.object({
    fieldId: z.string(),
    fieldRef: z.string(),
    tableName: z.string(),
    operator: z.string(),
    values: z.array(z.unknown()).optional(),
    settings: z.unknown().optional(),
    required: z.boolean(),
});

export const TOOL_FIND_EXPLORES_DESCRIPTION = `Tool: findExplores

Purpose:
Returns explores matching the query with joined tables, required filters, AI hints, full descriptions, and compact lists of all dimension/metric field ids available in each matched explore. Search matches explore name, label, description, and AI hints. A follow-up query runs against a single explore, so this tool is meant to identify the explore to inspect next with findFields or listFields.

IMPORTANT: Each explore may include fields from multiple joined tables. Check the "joinedTables" elements to see which tables are included in the explore.

Parameters:
- searchQuery: Keyword terms for finding relevant explores

Output:
- Matching explores with searchRank scores, joined tables, required filters, AI hints, and full descriptions
- Compact all-field inventories split into dimension and metric field ids

Field descriptions are not included in the compact field inventories. Use findFields to search/compare fields by label/description, or listFields when you need exact full metadata for known field ids.
`;

export const toolFindExploresArgsSchemaV1 = createToolSchema()
    .extend({
        exploreName: z
            .string()
            .nullable()
            .describe('Name of the explore that you have access to'),
    })
    .withPagination()
    .build();

export const toolFindExploresArgsSchemaV2 = createToolSchema()
    .extend({
        exploreName: z
            .string()
            .describe('Name of the explore that you have access to'),
    })
    .build();

export const toolFindExploresArgsSchemaV3 = createToolSchema()
    .extend({
        searchQuery: z
            .string()
            .describe(
                "set of high-signal keyword terms for query. Search uses PostgreSQL websearch_to_tsquery after joining whitespace-separated terms with OR. It searches explore name, label, description, and AI hints. Prefer entity/domain nouns that capture the user's analytical intent.",
            ),
    })
    .build();

export const toolFindExploresArgsSchemaTransformed =
    toolFindExploresArgsSchemaV3;

const findExploresExploreResultSchema = z.object({
    exploreName: z.string(),
    label: z.string(),
    searchRank: z.number().nullable().optional(),
    description: z.string().nullable().optional(),
    aiHints: z.array(z.string()),
    joinedTables: z.array(z.string()),
    requiredFilters: z.array(requiredFilterSchema),
    dimensions: z.array(z.string()),
    metrics: z.array(z.string()),
});

export const findExploresRankingMetadataSchema = z.object({
    searchQuery: z.string(),
    explores: z.array(findExploresExploreResultSchema),
});

export const toolFindExploresOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema.extend({
        ranking: findExploresRankingMetadataSchema.optional(),
    }),
});

export type ToolFindExploresArgsV1 = z.infer<
    typeof toolFindExploresArgsSchemaV1
>;
export type ToolFindExploresArgsV2 = z.infer<
    typeof toolFindExploresArgsSchemaV2
>;
export type ToolFindExploresArgsV3 = z.infer<
    typeof toolFindExploresArgsSchemaV3
>;
export type ToolFindExploresArgs = z.infer<typeof toolFindExploresArgsSchemaV3>;
export type ToolFindExploresArgsTransformed = ToolFindExploresArgs;
export type ToolFindExploresOutput = z.infer<
    typeof toolFindExploresOutputSchema
>;
