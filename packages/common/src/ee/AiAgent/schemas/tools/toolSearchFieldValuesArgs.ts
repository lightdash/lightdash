import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import type { ToolSchemaBuilder } from '../toolSchemaBuilder';
import {
    defineTool,
    type ToolInput,
    type ToolOutput,
    type ToolParsedInput,
} from './toolDefinition';

const getToolSearchFieldValuesDescription = ({
    name,
}: {
    name: string;
}) => `Tool: ${name}

Purpose:
Search for unique values of a specific field in a table. Returns all unique values by default, or use the query parameter to narrow down results. This is useful for finding suggestions for field values when building filters or exploring data.

Usage Tips:
- Specify the table and field you want to search values for
- Query parameter: use it to narrow down the search to matching values
- Optionally add filters to further restrict the results
- Results are returned as a list of unique field values (limited to 100)
`;

const toolSearchFieldValuesArgsFields = {
    table: z.string().describe('The table to search in.'),
    fieldId: getFieldIdSchema({
        additionalDescription: 'The ID of the field to search values for',
    }),
    query: z
        .string()
        .describe('Query string to filter field values')
        .nullable(),
    filters: filtersSchemaV2
        .nullable()
        .describe(
            'Filters to apply to the query. Filtered fields must exist in the selected explore or should be referenced from the custom metrics.',
        ),
};

const buildToolSearchFieldValuesArgsSchema = ({
    createSchema,
}: {
    createSchema: () => ToolSchemaBuilder<{}>;
}) => createSchema().extend(toolSearchFieldValuesArgsFields).build();

const toolSearchFieldValuesArgsSchema = z.object(
    toolSearchFieldValuesArgsFields,
);

const toolSearchFieldValuesArgsSchemaTransformed =
    toolSearchFieldValuesArgsSchema.transform((data) => ({
        ...data,
        filters: data.filters
            ? filtersSchemaTransformed.parse(data.filters)
            : undefined,
        query: data.query ?? '',
    }));

const parseSearchFieldValuesInput = (raw: unknown) =>
    toolSearchFieldValuesArgsSchemaTransformed.parse(raw);

const toolSearchFieldValuesOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const searchFieldValuesTool = defineTool({
    canonicalName: 'searchFieldValues',
    title: 'Search Field Values',
    contexts: ['agent', 'mcp'] as const,
    description: {
        agent: ({ name }) => getToolSearchFieldValuesDescription({ name }),
        mcp: ({ name }) => getToolSearchFieldValuesDescription({ name }),
    },
    buildInputSchemas: {
        agent: () => toolSearchFieldValuesArgsSchema,
        mcp: ({ createSchema }) =>
            buildToolSearchFieldValuesArgsSchema({ createSchema }),
    },
    outputSchema: toolSearchFieldValuesOutputSchema,
    parseInput: {
        agent: parseSearchFieldValuesInput,
        mcp: parseSearchFieldValuesInput,
    },
});

export type ToolSearchFieldValuesArgs = ToolInput<
    typeof searchFieldValuesTool,
    'agent'
>;
export type ToolSearchFieldValuesArgsTransformed = ToolParsedInput<
    typeof searchFieldValuesTool,
    'agent'
>;
export type ToolSearchFieldValuesOutput = ToolOutput<
    typeof searchFieldValuesTool
>;
