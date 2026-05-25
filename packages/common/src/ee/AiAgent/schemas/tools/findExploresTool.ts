import { z } from 'zod';
import { defineTool } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

/** @deprecated Legacy V1 args (exploreName + pagination); retained only to type historical tool calls. */
const toolFindExploresArgsSchemaV1 = createToolSchema()
    .extend({
        exploreName: z
            .string()
            .nullable()
            .describe('Name of the explore that you have access to'),
    })
    .withPagination()
    .build();

/** @deprecated Legacy V2 args (exploreName); retained only to type historical tool calls. */
const toolFindExploresArgsSchemaV2 = createToolSchema()
    .extend({
        exploreName: z
            .string()
            .describe('Name of the explore that you have access to'),
    })
    .build();

const toolFindExploresArgsSchemaV3 = createToolSchema()
    .extend({
        // TODO: check if we need to add exploreName back in for backward compatibility
        searchQuery: z
            .string()
            .describe(
                'The full user query or search terms to help find the most relevant explore. Use the complete user request for better search results.',
            ),
    })
    .build();

export const findExploresRankingMetadataSchema = z.object({
    searchQuery: z.string(),
    exploreSearchResults: z
        .array(
            z.object({
                name: z.string(),
                label: z.string(),
                searchRank: z.number().nullable().optional(),
                joinedTables: z.array(z.string()).nullable().optional(),
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

const toolFindExploresOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema.extend({
        ranking: findExploresRankingMetadataSchema.optional(),
    }),
});

export const findExploresTool = defineTool({
    name: 'findExplores',
    title: 'Find Explores',
    description: (name) => `Tool: ${name}

Purpose:
Returns an explore with all its fields, joined tables, AI hints and descriptions. When multiple explores match your search, also returns alternative explores and top 50 matching fields across ALL explores.
IMPORTANT: Each explore may include fields from multiple joined tables. Check the "joinedTables" elements to see which tables are included in the explore.

Parameters:
- searchQuery: Full user query for finding relevant explores

Output:
- Selected explore with all fields and metadata (including fields from joined tables)
- Alternative explores (if multiple matches) with searchRank scores
- Top matching fields with their explore names and searchRank scores
`,
    availability: 'both',
    inputSchema: toolFindExploresArgsSchemaV3,
    agent: { outputSchema: toolFindExploresOutputSchema },
    mcp: {
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
    },
});

// Any historical findExplores tool-call args: legacy `exploreName` shapes
// (V1/V2) or the current `searchQuery` shape (V3).
export type ToolFindExploresArgs =
    | z.infer<typeof toolFindExploresArgsSchemaV1>
    | z.infer<typeof toolFindExploresArgsSchemaV2>
    | z.infer<typeof toolFindExploresArgsSchemaV3>;
