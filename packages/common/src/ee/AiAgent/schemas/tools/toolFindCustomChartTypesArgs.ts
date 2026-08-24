import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
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

export const toolFindCustomChartTypesOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolFindCustomChartTypesArgs = z.infer<
    typeof toolFindCustomChartTypesArgsSchema
>;
export type ToolFindCustomChartTypesOutput = z.infer<
    typeof toolFindCustomChartTypesOutputSchema
>;
