import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export const TOOL_FIND_EXPLORES_DESCRIPTION = ({
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

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

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export const toolFindExploresArgsSchemaV1 = createToolSchema()
    .extend({
        exploreName: z
            .string()
            .nullable()
            .describe('Name of the explore that you have access to'),
    })
    .withPagination()
    .build();

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export const toolFindExploresArgsSchemaV2 = createToolSchema()
    .extend({
        exploreName: z
            .string()
            .describe('Name of the explore that you have access to'),
    })
    .build();

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
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

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export const toolFindExploresArgsSchemaTransformed =
    toolFindExploresArgsSchemaV3;

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
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

export const findExploresRequiredFilterSchema = z.object({
    fieldId: z.string(),
    fieldRef: z.string(),
    tableName: z.string(),
    operator: z.string(),
    values: z.array(z.unknown()).optional(),
    settings: z.unknown().optional(),
    required: z.boolean(),
});

export const findExploresRelevantVerifiedAnswerSchema = z.object({
    artifactVersionUuid: z.string(),
    chartConfig: z.record(z.string(), z.unknown()),
    artifactType: z.enum(['chart', 'dashboard']),
    verifiedQuestion: z.string().nullable(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    similarity: z.number(),
});

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export const toolFindExploresStructuredContentSchema = z.object({
    searchQuery: z.string(),
    description: z.string(),
    searchResults: z.object({
        count: z.number(),
        note: z.string(),
        results: z.array(
            z.object({
                name: z.string(),
                label: z.string(),
                searchRank: z.number().nullable(),
                description: z.string().nullable(),
                aiHints: z.array(z.string()),
                joinedTables: z.object({
                    count: z.number(),
                    note: z.string().nullable(),
                    tables: z.array(z.string()),
                }),
                requiredFilters: z.array(findExploresRequiredFilterSchema),
            }),
        ),
    }),
    topMatchingFields: z.object({
        count: z.number(),
        note: z.string(),
        fields: z.array(
            z.object({
                name: z.string(),
                label: z.string(),
                exploreName: z.string(),
                fieldType: z.string(),
                searchRank: z.number().nullable(),
                usageInCharts: z.number(),
                usageInVerifiedCharts: z.number(),
            }),
        ),
    }),
    relevantVerifiedAnswers: z
        .array(findExploresRelevantVerifiedAnswerSchema)
        .optional(),
});

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export const toolFindExploresMetadataSchema = baseOutputMetadataSchema.extend({
    ranking: findExploresRankingMetadataSchema.optional(),
});

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export const findExploresResultSchema = toolFindExploresStructuredContentSchema;

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export const toolFindExploresOutputSchema = structuredToolOutputSchema({
    metadata: toolFindExploresMetadataSchema,
    structuredContent: toolFindExploresStructuredContentSchema,
});

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export const isToolFindExploresResult = makeBuiltInToolResultGuard(
    'findExplores',
    toolFindExploresMetadataSchema,
);

/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export type ToolFindExploresArgsV1 = z.infer<
    typeof toolFindExploresArgsSchemaV1
>;
/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export type ToolFindExploresArgsV2 = z.infer<
    typeof toolFindExploresArgsSchemaV2
>;
/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export type ToolFindExploresArgsV3 = z.infer<
    typeof toolFindExploresArgsSchemaV3
>;
/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export type ToolFindExploresArgs = z.infer<typeof toolFindExploresArgsSchemaV3>;
/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export type ToolFindExploresArgsTransformed = ToolFindExploresArgs;
export type FindExploresRequiredFilter = z.infer<
    typeof findExploresRequiredFilterSchema
>;
/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export type ToolFindExploresStructuredContent = z.infer<
    typeof toolFindExploresStructuredContentSchema
>;
/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export type FindExploresResult = ToolFindExploresStructuredContent;
/** @deprecated Legacy `findExplores` tool contract, kept for historical tool calls. */
export type ToolFindExploresOutput = z.infer<
    typeof toolFindExploresOutputSchema
>;
