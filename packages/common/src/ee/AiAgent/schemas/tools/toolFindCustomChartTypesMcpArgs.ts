import { z } from 'zod';
import {
    dataAppVizGradientValueSchema,
    type DataAppVizSchema,
} from '../../../apps/types';

export const MCP_TOOL_FIND_CUSTOM_CHART_TYPES_DESCRIPTION = `Tool: find_custom_chart_types

Search the project's custom chart types (reusable visualizations, including ones installed from the library) by \`query\` against name and description, or fetch one by \`slug\`. Set exactly one of the two; to browse page by page, use list_custom_chart_types.

- Each match has its latest version, field slots, config options and a Chart Studio link.
- Search before create_custom_chart_type and reuse a type that fits.
- To save a chart with a type, call create_content with chartConfig { type: "data_app_viz", config: { dataAppVizSlug, fieldMapping, optionValues } }, binding each slot name to query field IDs.
`;

export const mcpFindCustomChartTypesArgsSchema = z.object({
    query: z
        .string()
        .nullish()
        .default(null)
        .describe(
            'Keyword terms matched against chart type names and descriptions. Set exactly one of query or slug.',
        ),
    slug: z
        .string()
        .nullish()
        .default(null)
        .describe(
            'Exact slug of one chart type. Set exactly one of query or slug.',
        ),
});

export type McpFindCustomChartTypesArgs = z.infer<
    typeof mcpFindCustomChartTypesArgsSchema
>;

// Plain mirror of the stored viz schema: the read validator's
// null-to-undefined transforms cannot be expressed as an output JSON schema.
const mcpCustomChartTypeVizSchemaOutputSchema = z.object({
    fields: z
        .array(
            z.object({
                name: z
                    .string()
                    .describe('Slot name: the key to bind in fieldMapping.'),
                label: z.string(),
                type: z.enum(['dimension', 'metric', 'series', 'column']),
                required: z.boolean(),
                multiple: z
                    .boolean()
                    .describe('Whether the slot takes an ordered list.'),
                description: z.string().nullable(),
            }),
        )
        .describe('Field slots to bind query fields to.'),
    configOptions: z
        .array(
            z.object({
                name: z
                    .string()
                    .describe('Option name: the key to set in optionValues.'),
                label: z.string(),
                type: z.enum([
                    'boolean',
                    'select',
                    'number',
                    'text',
                    'color',
                    'gradient',
                ]),
                group: z.string().nullable(),
                default: z.union([
                    z.boolean(),
                    z.number(),
                    z.string(),
                    dataAppVizGradientValueSchema,
                ]),
                choices: z
                    .array(z.object({ value: z.string(), label: z.string() }))
                    .nullable()
                    .describe('Allowed values of a select option.'),
                min: z.number().nullable(),
                max: z.number().nullable(),
            }),
        )
        .describe('Settings the chart accepts in optionValues.'),
    colorPalette: z
        .object({ group: z.string().nullable() })
        .nullable()
        .describe('Set when the chart colours series from the palette.'),
    hierarchy: z.object({ field: z.string() }).nullable(),
    inputGuidance: z.string().nullable(),
});

export const mcpCustomChartTypeOutputSchema = z.object({
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    version: z
        .number()
        .int()
        .positive()
        .describe('Latest ready version, the one a new chart renders.'),
    chartStudioUrl: z.string(),
    vizSchema: mcpCustomChartTypeVizSchemaOutputSchema,
});

export type McpCustomChartType = z.infer<typeof mcpCustomChartTypeOutputSchema>;

export const mcpFindCustomChartTypesOutputSchema = z.object({
    results: z.array(mcpCustomChartTypeOutputSchema),
});

export const toMcpCustomChartTypeVizSchema = (
    schema: DataAppVizSchema,
): McpCustomChartType['vizSchema'] => ({
    fields: schema.fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
        multiple: field.multiple ?? false,
        description: field.description ?? null,
    })),
    configOptions: schema.configOptions.map((option) => ({
        name: option.name,
        label: option.label,
        type: option.type,
        group: option.group ?? null,
        default: option.default,
        choices: option.type === 'select' ? option.choices : null,
        min: option.type === 'number' ? (option.min ?? null) : null,
        max: option.type === 'number' ? (option.max ?? null) : null,
    })),
    colorPalette:
        schema.colorPalette === null
            ? null
            : { group: schema.colorPalette.group ?? null },
    hierarchy: schema.hierarchy ?? null,
    inputGuidance: schema.inputGuidance ?? null,
});
