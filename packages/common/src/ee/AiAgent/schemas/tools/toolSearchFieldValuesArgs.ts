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

const emptyFiltersInstructionByRuntime = {
    agent: 'Set filters to null when the search does not need additional filters',
    mcp: 'Omit filters when the search does not need additional filters',
} satisfies Record<ToolDescriptionContext['runtime'], string>;

const PURPOSE = `Purpose:
Validate or disambiguate a candidate value for a specific dimension (e.g. a product name or status) before filtering on it. Returns up to 100 unique values matching the query.`;

const SEARCH_ONLY_WHEN_UNCERTAIN =
    'Search only when the value is uncertain: when the user or field metadata already gives the exact value, filter on it directly';

const SEARCH_RESULT_GUIDANCE =
    'Reading the result: the values describe observed data, not the permitted filter literals.';

export const TOOL_SEARCH_FIELD_VALUES_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

${PURPOSE}

Usage Tips:
- ${SEARCH_ONLY_WHEN_UNCERTAIN}
- ${emptyFiltersInstructionByRuntime[runtime]}

${SEARCH_RESULT_GUIDANCE}
`;

const expressionGuidanceByRuntime = {
    agent: `Filter expressions use \`<fieldId> <operator>[=<value>...]\`. The input schema defines filter scope, nullability, and the dimension-only AND constraint; for supported operators, quoting, and examples, follow ${modelGuidanceSourceByRuntime.agent}.`,
    mcp: `Filter expressions use \`<fieldId> <operator>[=<value>...]\`. The input schema defines filter scope, nullability, and the dimension-only AND constraint. ${MCP_FILTER_EXPRESSION_SKILL_INSTRUCTION}`,
} satisfies Record<ToolDescriptionContext['runtime'], string>;

export const TOOL_SEARCH_FIELD_VALUES_FILTER_EXPRESSION_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

${PURPOSE}

Usage Tips:
- ${SEARCH_ONLY_WHEN_UNCERTAIN}
- Omit filters when the search does not need additional filters
- ${expressionGuidanceByRuntime[runtime]}

${SEARCH_RESULT_GUIDANCE}
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
                'Candidate text to match within field values, e.g. "complete" for a status. Without candidate text only curated field metadata values come back reliably, and an empty warehouse-backed search may be rejected, so never use it to enumerate a column.',
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
            'Unique field values matching the query, at most 100. Empty when nothing matched.',
        ),
    note: z
        .string()
        .nullable()
        .describe(
            'Guidance about the returned values, e.g. that they come from curated field metadata or that value suggestions are disabled for the field. Null when there is none.',
        ),
    matchingValue: z
        .union([z.string(), z.number(), z.boolean()])
        .nullable()
        .describe(
            'The returned value that matches the requested query (exact hit or decision-resolved equivalent); null when none was asserted.',
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
