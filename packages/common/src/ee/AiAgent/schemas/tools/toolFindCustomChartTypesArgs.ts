import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FIND_CUSTOM_CHART_TYPES_DESCRIPTION = `Purpose:
Browse the project's custom chart type library. Set \`query\` to keyword-search types by name and description, or set \`slug\` to fetch one exact type — set exactly one of the two. Each match returns the type's slug plus its full schema: the field slots to bind query fields to (name, label, type, required) and the config options it accepts.

Use it to look beyond the types inlined in availableCustomChartTypes, or to read a type's full schema before rendering through it.

Parameters:
- query: keyword terms matched against custom chart type names and descriptions
- slug: exact slug of one custom chart type, from availableCustomChartTypes or a previous search

Output:
- Matching custom chart types, each with slug, name, description and full serialized schema (field slots and config option details)
`;

export const toolFindCustomChartTypesArgsSchema = createToolSchema()
    .extend({
        query: z
            .string()
            .nullish()
            .describe(
                'Keyword terms matched against custom chart type names and descriptions. Set exactly one of query or slug.',
            ),
        slug: z
            .string()
            .nullish()
            .describe(
                'Exact slug of one custom chart type. Set exactly one of query or slug.',
            ),
    })
    .build();

export const toolFindCustomChartTypesStructuredContentSchema = z.object({
    request: z
        .union([
            z.object({
                query: z
                    .string()
                    .describe(
                        'Keyword terms searched against type names and descriptions.',
                    ),
            }),
            z.object({
                slug: z.string().describe('Exact slug that was fetched.'),
            }),
        ])
        .describe(
            'The lookup that ran: a keyword search or an exact slug fetch.',
        ),
    matches: z.object({
        count: z
            .number()
            .int()
            .describe('Number of matching custom chart types (0 when none).'),
        note: z
            .string()
            .describe(
                'Guidance for using the matches, or why there are none and what to try next.',
            ),
        results: z.array(
            z.object({
                slug: z
                    .string()
                    .describe('Identifies the type when rendering through it.'),
                name: z.string(),
                description: z.string(),
                schema: z
                    .string()
                    .describe(
                        'Serialized schema: field slots to bind query fields to (name, label, type, required) and the config options it accepts.',
                    ),
            }),
        ),
    }),
});

export const toolFindCustomChartTypesOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolFindCustomChartTypesStructuredContentSchema,
});

export type ToolFindCustomChartTypesArgs = z.infer<
    typeof toolFindCustomChartTypesArgsSchema
>;
export type ToolFindCustomChartTypesStructuredContent = z.infer<
    typeof toolFindCustomChartTypesStructuredContentSchema
>;
export type ToolFindCustomChartTypesOutput = z.infer<
    typeof toolFindCustomChartTypesOutputSchema
>;
