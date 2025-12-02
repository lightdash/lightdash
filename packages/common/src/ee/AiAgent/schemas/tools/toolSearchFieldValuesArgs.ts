import { z } from 'zod';
import { getFieldIdSchema } from '../fieldId';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_SEARCH_FIELD_VALUES_DESCRIPTION = `Tool: searchFieldValues

Purpose:
Search for unique values of a specific field in a table. Returns all unique values by default, or use the query parameter to narrow down results. This is useful for finding suggestions for field values when building filters or exploring data.

Usage Tips:
- Specify the table and field you want to search values for
- Query parameter: use it to narrow down the search to matching values
- Optionally add filters to further restrict the results
- Results are returned as a list of unique field values (limited to 100)
`;

export const toolSearchFieldValuesArgsSchema = createToolSchema({
    description: TOOL_SEARCH_FIELD_VALUES_DESCRIPTION,
})
    .extend({
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
    })
    .build();

export const toolSearchFieldValuesArgsSchemaTransformed =
    toolSearchFieldValuesArgsSchema.transform((data) => ({
        ...data,
        filters: data.filters
            ? filtersSchemaTransformed.parse(data.filters)
            : undefined,
        query: data.query ?? '',
    }));

export const toolSearchFieldValuesOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolSearchFieldValuesArgs = z.infer<
    typeof toolSearchFieldValuesArgsSchema
>;
export type ToolSearchFieldValuesArgsTransformed = z.infer<
    typeof toolSearchFieldValuesArgsSchemaTransformed
>;
export type ToolSearchFieldValuesOutput = z.infer<
    typeof toolSearchFieldValuesOutputSchema
>;
