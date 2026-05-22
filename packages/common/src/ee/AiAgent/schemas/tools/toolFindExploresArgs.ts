import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    defineTool,
    type ToolInput,
    type ToolOutput,
    type ToolParsedInput,
} from './toolDefinition';

const getToolFindExploresDescription = ({
    name,
}: {
    name: string;
}) => `Tool: ${name}

Purpose:
Returns an explore with all its fields, joined tables, AI hints and descriptions. When multiple explores match your search, also returns alternative explores and top 50 matching fields across ALL explores.
IMPORTANT: Each explore may include fields from multiple joined tables. Check the "joinedTables" elements to see which tables are included in the explore.

Parameters:
- searchQuery: Full user query for finding relevant explores

Output:
- Selected explore with all its fields and metadata (including fields from joined tables)
- Alternative explores (if multiple matches) with searchRank scores
- Top matching fields with their explore names and searchRank scores
`;

const toolFindExploresArgsSchemaV1 = createToolSchema({
    description: getToolFindExploresDescription({
        name: 'findExplores',
    }),
})
    .extend({
        exploreName: z
            .string()
            .nullable()
            .describe('Name of the explore that you have access to'),
    })
    .withPagination()
    .build();

const toolFindExploresArgsSchemaV2 = createToolSchema({
    description: getToolFindExploresDescription({
        name: 'findExplores',
    }),
})
    .extend({
        exploreName: z
            .string()
            .describe('Name of the explore that you have access to'),
    })
    .build();

const toolFindExploresArgsSchemaV3 = createToolSchema({
    description: getToolFindExploresDescription({
        name: 'findExplores',
    }),
})
    .extend({
        searchQuery: z
            .string()
            .describe(
                'The full user query or search terms to help find the most relevant explore. Use the complete user request for better search results.',
            ),
    })
    .build();

const mcpToolFindExploresArgsSchema = createToolSchema({
    description: getToolFindExploresDescription({
        name: 'find_explores',
    }),
})
    .extend({
        searchQuery: z
            .string()
            .describe(
                'The full user query or search terms to help find the most relevant explore. Use the complete user request for better search results.',
            ),
    })
    .build();

const toolFindExploresArgsSchemaTransformed = toolFindExploresArgsSchemaV3;

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

export const toolFindExploresOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema.extend({
        ranking: findExploresRankingMetadataSchema.optional(),
    }),
});

export const findExploresTool = defineTool({
    canonicalName: 'findExplores',
    title: 'Find Explores',
    contexts: ['agent', 'mcp'] as const,
    buildInputSchemas: {
        agent: () => toolFindExploresArgsSchemaV3,
        mcp: () => mcpToolFindExploresArgsSchema,
    },
    outputSchema: toolFindExploresOutputSchema,
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
export type ToolFindExploresArgs = ToolInput<typeof findExploresTool, 'agent'>;
export type ToolFindExploresArgsTransformed = ToolParsedInput<
    typeof findExploresTool,
    'agent'
>;
export type ToolFindExploresOutput = ToolOutput<typeof findExploresTool>;
