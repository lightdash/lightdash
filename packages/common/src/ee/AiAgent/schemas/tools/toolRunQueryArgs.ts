import { z } from 'zod';
import { MergeJoinType } from '../../../../types/mergeQuery';
import {
    customMetricsSchema,
    customMetricsSchemaTransformed,
} from '../customMetrics';
import { type ToolDescriptionContext } from '../defineTool';
import { getFieldIdSchema } from '../fieldId';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import sortFieldSchema from '../sortField';
import {
    formulaTableCalcsSchema,
    tableCalcsSchema,
} from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import {
    buildMcpQueryRunResponseDescription,
    buildMcpVisualizationFollowUpInstruction,
    MCP_QUERY_COMMON_NOTES,
} from './toolMcpQueryResultDescription';
import { mcpAsyncQueryUuidSchema } from './toolQueryResultSchemas';

// Query configuration schema - what data to fetch
export const queryConfigBaseSchema = z.object({
    exploreName: z
        .string()
        .describe(
            'The name of the explore containing the metrics and dimensions used for the chart.',
        ),
    dimensions: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .describe(
            'The field ids for the dimensions to group the metrics by. dimensions[0] is the primary grouping (x-axis for charts). dimensions[1+] create additional grouping levels.',
        ),
    metrics: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .describe(
            'The field ids of the metrics to be calculated. They will be grouped by the dimensions.',
        ),
    sorts: z
        .array(sortFieldSchema)
        .describe(
            'Sort configuration for the query, it can use a combination of metrics and dimensions.',
        ),
    limit: z.coerce
        .number()
        .nullable()
        .describe(
            'The total number of data points / rows allowed on the chart. null means this tool\'s maximum, not "no data" — use it unless the user asked for a specific number of rows. Row limits documented for other tools do not apply here.',
        ),
    parameters: z
        .record(
            z.string(),
            z.union([
                z.string(),
                z.number(),
                z.array(z.string()),
                z.array(z.number()),
            ]),
        )
        .nullable()
        .default(null)
        .describe(
            'Lightdash parameter values for this query, keyed by parameter name exactly as shown in the explore metadata (e.g. {"orders.metric": "active_users"}). REQUIRED whenever a selected field is marked "requires parameters" and the default value does not match what the user asked for — an unset parameter silently resolves to its default, which can return the wrong data. null when the explore has no parameters or the defaults are correct.',
        ),
});

// V1 took filters/customMetrics/tableCalculations at the top level, but LLMs
// kept nesting them (especially filters) inside queryConfig or emitting
// invalid combinations. V2 makes queryConfig the canonical (and only) place.
const queryConfigSchemaV1 = queryConfigBaseSchema.extend({
    filters: filtersSchemaV2.nullable().default(null),
});

const queryConfigSchemaV2 = queryConfigBaseSchema.extend({
    customMetrics: customMetricsSchema,
    tableCalculations: tableCalcsSchema,
    filters: filtersSchemaV2.nullable(),
});

// V4 narrows the advertised tableCalculations contract to formula-only.
// V1–V3 keep the wide union (templates + formula) for parsing persisted args.
const queryConfigSchemaV4 = queryConfigSchemaV2.extend({
    tableCalculations: formulaTableCalcsSchema,
});

export const mergeSourceQueryConfigSchema = queryConfigSchemaV2
    .omit({
        limit: true,
        parameters: true,
        tableCalculations: true,
    })
    .describe(
        'A second semantic-layer query. The primary query limit and parameter values apply to the whole merge.',
    );

export const mergeConfigSchema = z
    .object({
        primarySourceId: z
            .string()
            .min(1)
            .describe('Stable id assigned to the primary queryConfig.'),
        additionalSources: z
            .array(
                z.object({
                    id: z.string().min(1),
                    queryConfig: mergeSourceQueryConfigSchema,
                }),
            )
            .length(1)
            .describe(
                'The additional query to merge with queryConfig. Merge queries currently support exactly two sources.',
            ),
        joinKey: z
            .array(
                z.object({
                    name: z
                        .string()
                        .min(1)
                        .describe(
                            'Stable output name for this shared join-key column.',
                        ),
                    fields: z
                        .array(
                            z.object({
                                sourceId: z.string().min(1),
                                fieldId: getFieldIdSchema({
                                    additionalDescription: null,
                                }),
                            }),
                        )
                        .length(2)
                        .describe(
                            'One selected dimension from each source. Both must represent the same grain and value type.',
                        ),
                }),
            )
            .min(1),
        joinType: z.enum(MergeJoinType),
    })
    .nullable()
    .describe(
        'null for a normal visualization. Set this to combine queryConfig with one additional semantic-layer query. Every source may contain only join-key dimensions plus metrics; other dimensions cause fan-out and are refused. In chartConfig, join-key field ids are merge_<joinKeyName>. Metric field ids are <sourceId>_<originalFieldId>. Replace dots in either name with two underscores.',
    );

// Chart-specific configuration for rendering hints
const chartConfigBuiltinSchema = z.object({
    defaultVizType: z
        .enum([
            'table',
            'bar',
            'horizontal',
            'line',
            'scatter',
            'pie',
            'funnel',
        ])
        .describe('The default visualization type to render'),

    // Axis field selection
    xAxisDimension: z
        .string()
        .nullable()
        .describe(
            'The dimension field ID to use for the x-axis. Must be included in queryConfig.dimensions',
        ),
    yAxisMetrics: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .nullable()
        .describe(
            'The metric field IDs to display on the y-axis. Must be included in queryConfig.metrics or come from tableCalculations',
        ),

    // Series creation control
    groupBy: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .nullable()
        .describe(
            'Dimensions to split metrics into separate series (e.g., one line per region, one bar per status). IMPORTANT: Do NOT include the x-axis dimension in groupBy - only include dimensions you want to use for breaking down the data into multiple series. Example: dimensions=["order_date", "status"], groupBy=["status"] creates separate series for each status value. Leave null for simple single-series charts.',
        ),

    // Bar and horizontal bar chart specific
    xAxisType: z
        .enum(['category', 'time'])
        .nullable()
        .describe(
            'The x-axis type can be categorical for string value or time if the dimension is a date or timestamp. Applies to bar, horizontal, and scatter charts.',
        ),
    stackBars: z
        .boolean()
        .nullable()
        .describe(
            'If groupBy is provided then this will stack the bars on top of each other instead of side by side. Applies to bar and horizontal charts.',
        ),

    // Line chart specific
    lineType: z
        .enum(['line', 'area'])
        .nullable()
        .describe(
            'default line. The type of line to display. If area then the area under the line will be filled in.',
        ),

    // Common display properties
    xAxisLabel: z.string().describe('A helpful label to explain the x-axis'),
    yAxisLabel: z.string().describe('A helpful label to explain the y-axis'),
    secondaryYAxisMetric: z
        .string()
        .nullish()
        .default(null)
        .describe(
            '(Optional) A single metric field ID to display on a secondary (right) y-axis. Must NOT be included in yAxisMetrics. Use when one metric has a very different scale than others (e.g., percentage vs count).',
        ),
    secondaryYAxisLabel: z
        .string()
        .nullish()
        .default(null)
        .describe('A helpful label for the secondary y-axis'),
});

const customChartTypeOptionValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
]);

// Custom chart type branch of chartConfig — LLM-authored. Discriminated
// structurally from the builtin branch by customChartTypeSlug.
const chartConfigCustomChartTypeSchema = z.object({
    customChartTypeSlug: z
        .string()
        .describe(
            'Slug of the custom chart type to render this answer through. Must be a slug from availableCustomChartTypes or findCustomChartTypes.',
        ),
    fieldMapping: z
        .record(z.string(), getFieldIdSchema({ additionalDescription: null }))
        .describe(
            "Binds the custom chart type's field slots to this query's fields: slot name (from the type's schema) → a field id selected in queryConfig. Every required slot must be bound.",
        ),
    options: z
        .record(z.string(), customChartTypeOptionValueSchema)
        .nullish()
        .default(null)
        .describe(
            "Values for the type's config options, keyed by option name from the type's schema. null to use the type's defaults.",
        ),
});

// The only chartConfig union — advertised to the model and used to parse
// persisted tool args alike: builtin viz config | custom chart type slug.
// Server-derived custom chart type data (dataAppVizUuid) never lives inside
// chartConfig; it sits beside the verbatim tool args in the artifact envelope.
export const chartConfigSchema = z
    .union([chartConfigBuiltinSchema, chartConfigCustomChartTypeSchema])
    .nullable();

// Builtin-only view pinning surfaces that do not support custom chart types
// (MCP run_metric_query / render_chart, the dashboard tool): their contracts
// stay byte-identical to before the union existed.
export const chartConfigBuiltinOnlySchema = chartConfigBuiltinSchema.nullable();

export type ToolRunQueryBuiltinChartConfig = z.infer<
    typeof chartConfigBuiltinSchema
>;
export type ToolRunQueryCustomChartTypeConfig = z.infer<
    typeof chartConfigCustomChartTypeSchema
>;
export type ToolRunQueryChartConfig = z.infer<typeof chartConfigSchema>;

export const isCustomChartTypeSlugChartConfig = (
    chartConfig: ToolRunQueryChartConfig | undefined,
): chartConfig is ToolRunQueryCustomChartTypeConfig =>
    !!chartConfig && 'customChartTypeSlug' in chartConfig;

// The MCP lead paragraph carries the keywords lexical tool search ranks on;
// the agent runtime has its own prompt and different sibling tool names.
const MCP_RUN_QUERY_LEAD = `Run a governed metric query through the Lightdash semantic layer. Choose an explore and its metrics and dimensions (from grep_fields / get_metadata), add filters, sorts and a limit, and get consistent, centrally defined results. This is the preferred way to answer data questions and to reproduce a saved chart's query — prefer it over raw SQL whenever the fields exist in a modeled explore.`;

export const TOOL_RUN_QUERY_DESCRIPTION = ({
    runtime,
}: ToolDescriptionContext): string => `${
    runtime === 'mcp' ? MCP_RUN_QUERY_LEAD : 'Execute a metric query.'
}

If any selected field is marked "requires parameters" in field discovery or metadata, set the right values in queryConfig.parameters — an unset parameter silently resolves to its default, which can make the query return data that does not match the question.

This tool returns metric query data only. ${buildMcpVisualizationFollowUpInstruction(
    'run_metric_query',
)}

${buildMcpQueryRunResponseDescription({
    contentDescription:
        'bare CSV text. CSV headers are display labels, not stable field IDs',
    completedResultShape: `    result: {
      status: "done",
      queryUuid: string,
      rows: Array<Record<string, unknown>>,
      fields: Record<string, unknown>,
      exploreUrl: string | null
    }`,
})}

Notes:
${MCP_QUERY_COMMON_NOTES}
`;

// Kept only for parsing historical persisted tool args.
export const toolRunQueryArgsSchemaV1 = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: customMetricsSchema.default(null),
        tableCalculations: tableCalcsSchema.default(null),
        queryConfig: queryConfigSchemaV1,
        chartConfig: chartConfigSchema.default(null),
        filters: filtersSchemaV2.nullable().default(null),
    })
    .build();

export const toolRunQueryArgsSchemaV2 = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        queryConfig: queryConfigSchemaV2,
        chartConfig: chartConfigSchema,
    })
    .build();

// Merge-less advertised contract with formula-only table calcs: MCP
// run_metric_query and merge-disabled agent runtimes. Template-shaped
// payloads fail validation at the boundary with an actionable Zod error the
// model can correct; persisted args still parse via the wide schemas.
export const toolRunQueryArgsSchemaV2FormulaOnly = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        queryConfig: queryConfigSchemaV4,
        chartConfig: chartConfigSchema,
    })
    .build();

export const toolRunQueryArgsSchemaV3 = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        queryConfig: queryConfigSchemaV2,
        chartConfig: chartConfigSchema,
        mergeConfig: mergeConfigSchema.default(null),
    })
    .build();

export const toolRunQueryArgsSchemaV4 = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        queryConfig: queryConfigSchemaV4,
        chartConfig: chartConfigSchema,
        mergeConfig: mergeConfigSchema.default(null),
    })
    .build();

// MCP run_metric_query view: formula-only table calcs, and custom chart
// types are agent-only for the PoC so MCP keeps the builtin chart config.
export const toolRunQueryArgsSchemaV2Mcp =
    toolRunQueryArgsSchemaV2FormulaOnly.extend({
        chartConfig: chartConfigBuiltinOnlySchema,
    });

// V4 is the current agent contract (formula-only table calcs). MCP runQuery
// continues to advertise V2. Historical schemas remain available solely for
// persisted chats/artifacts — parse those with V1–V3, never with V4.
export const toolRunQueryArgsSchema = toolRunQueryArgsSchemaV4;

// Wide contract for parsing persisted args and incoming tool calls — call
// sites use this alias, never a versioned schema. Invariant: it accepts the
// output of every advertised version ever shipped (the wide table-calc union
// covers templates and formulas).
//
// Evolving the contract:
// - Additive field: no version bump. Add `.nullish().default(null)` to the
//   CURRENT schema (providers accept optional keys now) — old payloads and
//   models that omit it both parse, and this alias needs no change as long
//   as it carries the field too (add it here if the bases diverge; Zod
//   silently strips unknown keys).
// - Restructure or narrowing (fields moved, union members dropped from the
//   advertised contract): add V(N), point toolRunQueryArgsSchema at it, and
//   keep this alias wide enough to parse everything ever persisted. Never
//   narrow it — old threads must keep parsing.
export const toolRunQueryArgsSchemaPersisted = toolRunQueryArgsSchemaV3;

// For runtimes where merge queries are disabled: a merge-shaped payload
// must fail validation, not have Zod strip mergeConfig and run only the
// primary query. The preprocess leaves the emitted JSON schema unchanged.
export const toolRunQueryArgsSchemaV2RejectingMerge = z.preprocess(
    (raw, ctx) => {
        if (
            raw !== null &&
            typeof raw === 'object' &&
            'mergeConfig' in raw &&
            raw.mergeConfig !== null &&
            raw.mergeConfig !== undefined
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['mergeConfig'],
                message: 'Merge queries are not enabled for this organization.',
            });
            return z.NEVER;
        }
        return raw;
    },
    toolRunQueryArgsSchemaV2FormulaOnly,
);

export type ToolRunQueryArgsV1 = z.infer<typeof toolRunQueryArgsSchemaV1>;
export type ToolRunQueryArgsV2 = z.infer<typeof toolRunQueryArgsSchemaV2>;
export type ToolRunQueryArgsV3 = z.infer<typeof toolRunQueryArgsSchemaV3>;
export type ToolRunQueryArgsV4 = z.infer<typeof toolRunQueryArgsSchemaV4>;
// Deliberately wide (no V4): handlers receive V3-parsed data, which can carry
// legacy template table calcs the advertised V4 contract no longer accepts.
export type ToolRunQueryArgs = ToolRunQueryArgsV2 | ToolRunQueryArgsV3;

// Converts the raw V2 args into the internal domain shape: customMetrics and
// filters become Lightdash domain types. Piped (not transformed inline) so a
// malformed persisted value surfaces as a ZodError instead of a thrown
// exception out of safeParse.
const queryConfigInternalSchema = queryConfigBaseSchema.extend({
    customMetrics: customMetricsSchemaTransformed,
    tableCalculations: tableCalcsSchema,
    filters: filtersSchemaTransformed,
});

const runQueryInternalSchemaV2 = z.object({
    ...visualizationMetadataSchema.shape,
    queryConfig: queryConfigInternalSchema,
    chartConfig: chartConfigSchema.default(null),
});

const mergeSourceQueryConfigInternalSchema = queryConfigInternalSchema.omit({
    limit: true,
    parameters: true,
    tableCalculations: true,
});

const mergeConfigInternalSchema = mergeConfigSchema.unwrap().extend({
    additionalSources: z
        .array(
            z.object({
                id: z.string().min(1),
                queryConfig: mergeSourceQueryConfigInternalSchema,
            }),
        )
        .length(1),
});

const runQueryInternalSchemaV3 = runQueryInternalSchemaV2.extend({
    mergeConfig: mergeConfigInternalSchema.nullable().default(null),
});

// Zod 4 types every `z.coerce` input as unknown, so `.pipe` cannot see that the
// already-parsed output satisfies the internal schema; assert the input type.
export const toolRunQueryArgsSchemaV2Transformed =
    toolRunQueryArgsSchemaV2.pipe(
        runQueryInternalSchemaV2 as z.ZodType<
            z.output<typeof runQueryInternalSchemaV2>,
            z.output<typeof toolRunQueryArgsSchemaV2>
        >,
    );

export const toolRunQueryArgsSchemaTransformed = toolRunQueryArgsSchemaV3.pipe(
    runQueryInternalSchemaV3 as z.ZodType<
        z.output<typeof runQueryInternalSchemaV3>,
        z.output<typeof toolRunQueryArgsSchemaV3>
    >,
);

export type ToolRunQueryArgsTransformed = z.infer<
    typeof toolRunQueryArgsSchemaTransformed
>;

// Narrowed view for the builtin viz builders: dispatchers exclude the custom
// chart type branches before calling them.
export type ToolRunQueryArgsTransformedBuiltinChart = Omit<
    ToolRunQueryArgsTransformed,
    'chartConfig'
> & { chartConfig: ToolRunQueryBuiltinChartConfig | null };

// --- Backward compatibility -------------------------------------------------
// Only for parsing tool args persisted before V2. V1 put filters,
// customMetrics and tableCalculations at the top level; V2 forbids them and
// nests them inside queryConfig.

export const isRunQueryArgsV1 = (
    args: ToolRunQueryArgsV1 | ToolRunQueryArgsV2 | ToolRunQueryArgsV3,
): args is ToolRunQueryArgsV1 =>
    'customMetrics' in args || 'tableCalculations' in args || 'filters' in args;

export const migrateRunQueryArgsV1ToV2 = (
    v1: ToolRunQueryArgsV1,
): ToolRunQueryArgsV2 => ({
    title: v1.title,
    description: v1.description,
    chartConfig: v1.chartConfig,
    queryConfig: {
        exploreName: v1.queryConfig.exploreName,
        dimensions: v1.queryConfig.dimensions,
        metrics: v1.queryConfig.metrics,
        sorts: v1.queryConfig.sorts,
        limit: v1.queryConfig.limit,
        parameters: v1.queryConfig.parameters,
        customMetrics: v1.customMetrics,
        tableCalculations: v1.tableCalculations,
        // V1 accepted filters at the top level and (loosely) nested in
        // queryConfig; top level wins, matching the original behavior.
        filters: v1.filters ?? v1.queryConfig.filters ?? null,
    },
});

// Existing persisted filter formats have one shared connector across every
// category, so they cannot represent dimensions using AND while metrics use
// OR. Keep this parser unchanged for existing records; the wider persistence
// boundary handles the per-category filter-expression format separately.
export const parsePersistedRunQueryArgs = (
    raw: unknown,
): ToolRunQueryArgsTransformed | null => {
    // A merge payload must never fall back to V2: Zod strips unknown keys,
    // which would otherwise replay only the primary query and show wrong data.
    if (raw !== null && typeof raw === 'object' && 'mergeConfig' in raw) {
        const v3 = toolRunQueryArgsSchemaTransformed.safeParse(raw);
        return v3.success ? v3.data : null;
    }

    const v2 = toolRunQueryArgsSchemaV2Transformed.safeParse(raw);
    if (v2.success) return { ...v2.data, mergeConfig: null };

    const v1 = toolRunQueryArgsSchemaV1.safeParse(raw);
    return v1.success
        ? toolRunQueryArgsSchemaTransformed.parse({
              ...migrateRunQueryArgsV1ToV2(v1.data),
              mergeConfig: null,
          })
        : null;
};

export const TOOL_RENDER_CHART_DESCRIPTION = `Render a chart for a completed query result in MCP App-capable clients.

Use this after a query tool or get_query_result returns done and the user wants a visual chart. This tool does not start, poll, or rerun the query. If the query is still running, call get_query_result first. Pass the exact queryUuid that run_metric_query (or get_query_result) returned for this query in the current conversation — it is included in that tool's response as a \`queryUuid: <id>\` text block. Never invent, guess, or reuse a queryUuid from a different query or session; an unknown id fails with "not found". Lightdash loads the completed metric query from query history.

Current support: completed run_metric_query results. SQL Runner/run_sql results are not supported by render_chart. Other query result types are rejected until their chart rendering path is implemented.

Response shape (MCP CallToolResult):
- content: [{ type: "text", text: string }] — short render status message.
- structuredContent: {
    result: {
      status: "done",
      queryUuid: string,
      exploreUrl: string | null,
      echartsOption: Record<string, unknown> | null // lightweight placeholder; full chart payload is app metadata
    }
  }`;

export const toolRenderChartArgsSchema = createToolSchema()
    .extend({
        queryUuid: mcpAsyncQueryUuidSchema.describe(
            'Completed query UUID returned by run_metric_query (or get_query_result) in this conversation, copied from the `queryUuid: <id>` text block of that response. Do not fabricate, guess, or reuse a UUID from another query. Currently render_chart supports UUIDs from run_metric_query and does not support SQL Runner/run_sql UUIDs.',
        ),
        chartConfig: chartConfigBuiltinOnlySchema,
        title: z
            .string()
            .optional()
            .describe('Optional chart title used in the rendered chart.'),
        description: z
            .string()
            .optional()
            .describe(
                'Optional chart description used in the saved Explore URL.',
            ),
    })
    .build()
    .describe('Render chart input for a completed query.');

export const toolRenderChartArgsSchemaTransformed = toolRenderChartArgsSchema
    .extend({
        chartConfig: chartConfigBuiltinOnlySchema.default(null),
    })
    .transform((data) => ({
        ...data,
        title: data.title ?? 'Metric query result',
        description: data.description ?? '',
    }));

export type ToolRenderChartArgs = z.infer<typeof toolRenderChartArgsSchema>;

export type ToolRenderChartArgsTransformed = z.infer<
    typeof toolRenderChartArgsSchemaTransformed
>;

export const toolRunQueryOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema.extend({
        chartImageUrl: z.string().nullish(),
    }),
});

export type ToolRunQueryOutput = z.infer<typeof toolRunQueryOutputSchema>;
