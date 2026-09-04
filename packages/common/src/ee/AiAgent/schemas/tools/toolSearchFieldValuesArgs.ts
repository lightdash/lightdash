import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import { getFieldIdSchema } from '../fieldId';
import {
    FILTER_EXPRESSION_AND_ONLY_GRAMMAR_DESCRIPTION,
    filterExpressionInputSchema,
} from '../filterExpressions/expressionSchemas';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const boundedQueryInstructionByRuntime = {
    agent: 'Do not use a null or empty query to enumerate a warehouse column',
    mcp: 'Do not omit query or use an empty query to enumerate a warehouse column',
} satisfies Record<ToolDescriptionContext['runtime'], string>;

const emptyFiltersInstructionByRuntime = {
    agent: 'Set filters to null when the search does not need additional filters',
    mcp: 'Omit filters when the search does not need additional filters',
} satisfies Record<ToolDescriptionContext['runtime'], string>;

export const TOOL_SEARCH_FIELD_VALUES_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

Purpose:
Validate or discover concrete values for a specific dimension before building a filter. Returns up to 100 unique values matching the query.

Usage Tips:
- Specify the table and field ID whose values you want to search
- Prefer a non-empty query containing candidate text, such as "complete" for a status
- ${boundedQueryInstructionByRuntime[runtime]}. A query without candidate text can return curated values defined in field metadata; otherwise it may be rejected to prevent an unbounded distinct-value scan
- If the user or field metadata already provides the exact value, use it directly instead of searching
- ${emptyFiltersInstructionByRuntime[runtime]}
- When a filters object is provided, include type, dimensions, metrics, and tableCalculations. Use null or [] for every unused category; never omit a category
`;

export const TOOL_SEARCH_FIELD_VALUES_FILTER_EXPRESSION_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

Purpose:
Validate or discover concrete values for a specific dimension before building a filter. Returns up to 100 unique values matching the query.

Usage Tips:
- Specify the table and field ID whose values you want to search
- Prefer a non-empty query containing candidate text, such as "complete" for a status
- ${boundedQueryInstructionByRuntime[runtime]}. A query without candidate text can return curated values defined in field metadata; otherwise it may be rejected to prevent an unbounded distinct-value scan
- If the user or field metadata already provides the exact value, use it directly instead of searching
- Omit filters when the search does not need additional filters
- When filters is present, it scopes the candidate-value search and must be one flat AND expression containing dimension fields only

Filter expression syntax:
${FILTER_EXPRESSION_AND_ONLY_GRAMMAR_DESCRIPTION}

`;

export const toolSearchFieldValuesArgsSchema = createToolSchema()
    .extend({
        table: z.string().describe('The table to search in.'),
        fieldId: getFieldIdSchema({
            additionalDescription: 'The ID of the field to search values for',
        }),
        query: z
            .string()
            .describe(
                'Candidate text to match within field values. Prefer a non-empty value. Without candidate text, only curated field metadata values can be returned reliably; an empty warehouse-backed search may be rejected.',
            )
            .nullable(),
        filters: filtersSchemaV2
            .nullable()
            .describe(
                'Optional filters to scope the value search. If supplied, always include type, dimensions, metrics, and tableCalculations; use null or [] for every unused category. Never construct a partial filter group. Filtered fields must exist in the selected explore or be referenced from custom metrics.',
            ),
    })
    .build();

export const toolSearchFieldValuesExpressionArgsSchema =
    toolSearchFieldValuesArgsSchema
        .extend({
            filters: filterExpressionInputSchema
                .nullish()
                .default(null)
                .describe(
                    'When present, scopes the candidate-value search with one flat AND filter expression containing dimension fields only.',
                ),
        })
        .strict();

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
export type ToolSearchFieldValuesExpressionArgs = z.infer<
    typeof toolSearchFieldValuesExpressionArgsSchema
>;
export type ToolSearchFieldValuesOutput = z.infer<
    typeof toolSearchFieldValuesOutputSchema
>;
