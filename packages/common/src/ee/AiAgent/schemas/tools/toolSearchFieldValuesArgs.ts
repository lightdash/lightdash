import { z } from 'zod';
import {
    modelGuidanceSourceByRuntime,
    type ToolDescriptionContext,
} from '../defineTool';
import { getFieldIdSchema } from '../fieldId';
import { filterExpressionInputSchema } from '../filterExpressions/expressionSchemas';
import { MCP_FILTER_EXPRESSION_SKILL_INSTRUCTION } from '../filterExpressions/mcpGuidance';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
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

const expressionGuidanceByRuntime = {
    agent: `Filter expressions use \`<fieldId> <operator>[=<value>...]\`. The input schema defines filter scope, nullability, and the dimension-only AND constraint; for supported operators, quoting, and examples, follow ${modelGuidanceSourceByRuntime.agent}.`,
    mcp: `Filter expressions use \`<fieldId> <operator>[=<value>...]\`. The input schema defines filter scope, nullability, and the dimension-only AND constraint. ${MCP_FILTER_EXPRESSION_SKILL_INSTRUCTION}`,
} satisfies Record<ToolDescriptionContext['runtime'], string>;

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
- ${expressionGuidanceByRuntime[runtime]}
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

export const toolSearchFieldValuesStructuredContentSchema = z.object({
    // Not string | number | boolean: warehouse values aren't normalised, so
    // Postgres returns bigint for int8 and Date for date/timestamp columns.
    results: z
        .array(z.unknown())
        .describe(
            'Unique candidate field values, at most 100. Boolean fallback returns both true and false regardless of the query. Empty results do not prove a filter literal is absent or invalid.',
        ),
    note: z
        .string()
        .nullable()
        .describe(
            'Guidance about the returned values, e.g. that they come from curated field metadata or that value suggestions are disabled for the field. Null when there is none.',
        ),
    matchingValue: z
        .object({
            query: z.string(),
            value: z.union([z.string(), z.number(), z.boolean()]),
        })
        .nullable()
        .describe(
            'The requested query and its selected matching value when the text reports a match. Null when no match is reported.',
        ),
    search: z
        .string()
        .optional()
        .describe('Search text, when included in the returned search object.'),
    cached: z
        .boolean()
        .optional()
        .describe('Whether the returned search object reports cached results.'),
    refreshedAt: z
        .string()
        .optional()
        .describe(
            'Refresh timestamp as serialized in the returned search object.',
        ),
    resultsWithLabels: z
        .array(z.object({ value: z.string(), label: z.string().optional() }))
        .optional()
        .describe(
            'Values and their labels, when included in the search object.',
        ),
});

export const toolSearchFieldValuesOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolSearchFieldValuesStructuredContentSchema,
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
export type ToolSearchFieldValuesStructuredContent = z.infer<
    typeof toolSearchFieldValuesStructuredContentSchema
>;
