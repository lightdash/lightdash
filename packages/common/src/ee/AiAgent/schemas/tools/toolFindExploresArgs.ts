import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FIND_EXPLORES_DESCRIPTION = `Tool: findExplores

Purpose:
Returns explores matching the query with their joined tables, required filters, AI hints and descriptions, plus the top 50 matching fields across ALL explores. Search matches explore and field name, label, and description. A follow-up query runs against a single explore, so this tool is meant to identify the explore whose fields can answer the user's question.
IMPORTANT: Each explore may include fields from multiple joined tables. Check the "joinedTables" elements to see which tables are included in the explore.

Parameters:
- searchQuery: Keyword terms for finding relevant explores

Output:
- Matching explores with searchRank scores
- Top matching fields with their explore names and searchRank scores
- Required filters set on matching explores, including default values
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
        // TODO: check if we need to add exploreName back in for backward compatibility
        searchQuery: z
            .string()
            .describe(
                "set of high-signal keyword terms for query. Search uses PostgreSQL websearch_to_tsquery after joining whitespace-separated terms with OR. It searches explore and field name, label, and description. Prefer metric/entity/dimension nouns that capture the user's analytical intent.",
            ),
    })
    .build();

export const toolFindExploresArgsSchemaTransformed =
    toolFindExploresArgsSchemaV3;

export const findExploresRankingMetadataSchema = z.object({
    searchQuery: z.string(),
    exploreSearchResults: z
        .array(
            z.object({
                name: z.string(),
                label: z.string(),
                searchRank: z.number().nullable().optional(),
                joinedTables: z.array(z.string()).nullable().optional(),
                requiredFilters: z
                    .array(
                        z.object({
                            fieldId: z.string(),
                            fieldRef: z.string(),
                            tableName: z.string(),
                            operator: z.string(),
                            values: z.array(z.unknown()).optional(),
                            settings: z.unknown().optional(),
                            required: z.boolean(),
                        }),
                    )
                    .optional(),
            }),
        )
        .optional(),
    topMatchingFields: z
        .array(
            z.object({
                name: z.string(),
                label: z.string(),
                tableName: z.string(),
                fieldType: z.string(),
                searchRank: z.number().nullable().optional(),
                chartUsage: z.number().nullable().optional(),
                verifiedChartUsage: z.number().nullable().optional(),
            }),
        )
        .optional(),
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
