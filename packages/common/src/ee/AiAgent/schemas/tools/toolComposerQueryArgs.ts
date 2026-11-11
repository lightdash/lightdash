import { z } from 'zod';
import {
    CustomFormatType,
    DimensionType,
    MetricType,
    NumberSeparator,
    type CustomFormat,
} from '../../../../types/field';
import { type Filters } from '../../../../types/filter';
import {
    MERGE_TABLE_NAME,
    MergeJoinType,
    type MergeTableCalculation,
} from '../../../../types/mergeQuery';
import {
    type AdditionalMetric,
    type MetricQueryRequest,
    type SortField,
} from '../../../../types/metricQuery';
import { type ParametersValuesMap } from '../../../../types/parameters';
import {
    MAX_SOURCE_QUERIES_PER_SUBMISSION,
    QuerySourceType,
    type ApiSourceQuery,
    type DuckdbSourceQuery,
    type ExternalSourceQuery,
    type MergeSourceQuery,
    type PythonSourceQuery,
    type QueryNodeId,
    type SemanticLayerSourceQuery,
    type SqlSourceQuery,
} from '../../../../types/querySources';
import assertUnreachable from '../../../../utils/assertUnreachable';
import { currencies } from '../../../../utils/formatting';
import { getItemId } from '../../../../utils/item';
import { getLiveSourceAgentQueryGuide } from '../../../../utils/liveSourceIntegrations';
import {
    filterExpressionInputSchema,
    filterExpressionsSchema,
} from '../filterExpressions/expressionSchemas';
import { structuredToolOutputSchema } from '../outputMetadata';
import { withLeadingEquals } from '../tableCalcs/tableCalcFormula';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    appliedParametersSchema,
    parameterValueSchema,
} from './toolRunQueryArgs';

/** The composer query tool's name, and the name calls persisted before the rename carry. */
export const COMPOSER_QUERY_TOOL_NAMES = [
    'query',
    'runComposerQueries',
] as const;

export type ComposerQueryToolName = (typeof COMPOSER_QUERY_TOOL_NAMES)[number];

export const isComposerQueryToolName = (
    toolName: string,
): toolName is ComposerQueryToolName =>
    (COMPOSER_QUERY_TOOL_NAMES as readonly string[]).includes(toolName);

export const DEFAULT_COMPOSER_QUERY_LIMIT = 500;
export const DEFAULT_COMPOSER_QUERY_MAX_LIMIT = 5000;
export const COMPOSER_QUERY_PREVIEW_ROW_LIMIT = 50;
export const COMPOSER_NODE_SAMPLE_ROW_LIMIT = 5;
export const COMPOSER_QUERY_MAX_UNREAD_NODES = 5;

/** Libraries preinstalled in the python sandbox, pinned in sandboxes/python-runner/e2b.Dockerfile. */
export const PYTHON_SANDBOX_LIBRARIES = [
    { name: 'pandas', version: '2.2.3' },
    { name: 'numpy', version: '2.2.4' },
    { name: 'scipy', version: '1.15.2' },
    { name: 'pyarrow', version: '19.0.1' },
    { name: 'scikit-learn', version: '1.9.1' },
    { name: 'polars', version: '1.44.2' },
] as const;

const PYTHON_SANDBOX_LIBRARIES_DESCRIPTION = PYTHON_SANDBOX_LIBRARIES.map(
    ({ name, version }) =>
        `${name} ${version.split('.').slice(0, 2).join('.')}`,
).join(', ');

const PYTHON_CODE_DESCRIPTION = `Python defining run(inputs, params) -> pandas.DataFrame. Shape every node like this:

import pandas as pd

def run(inputs, params):
    df = inputs["orders"]                           # one DataFrame per reference, columns already typed
    cutoff = pd.Timestamp("2026-01-01")             # all datetimes are tz-naive UTC wall clock; never tz_localize/tz_convert
    out = df[df["created_at"] >= cutoff].groupby("customer_id", as_index=False)["revenue"].sum()
    return out                                      # unique snake_case column names, letter first, max 63 chars (revenue_2024, not "Revenue 2024" or 2024); flatten pivot/unstack columns; index dropped

Imports aside, all code inside run(). Read columns as df["col"], never df.col. Check df.dtypes before sum/astype.
Libraries: ${PYTHON_SANDBOX_LIBRARIES_DESCRIPTION}. No network, no installs.`;

type ComposerQueriesDescriptionOptions = {
    enablePythonNodes: boolean;
};

const DUCKDB_ALIAS_GUIDANCE =
    'Write each column alias with AS, because DuckDB rejects many keywords as bare aliases: `SUM(v) AS value`, `d AS day` and `fam AS label` work, `SUM(v) value` does not. Double-quote a column named after a reserved word, such as `"order"`.';

const getComposerNodeKindsDescription = ({
    enablePythonNodes,
    sqlNote,
}: ComposerQueriesDescriptionOptions & { sqlNote: string }) => `Node kinds:
- "semanticLayer": a metric query against an explore. Result columns are the requested field ids.
- "sql": raw SQL against the project warehouse; ${sqlNote}.
- "external": DuckDB SQL over uploaded or connected tables declared in "tables".
- "merge": joins semanticLayer nodes on dimensions they share at the same grain, without SQL. Its columns keep each governed field's label, format and description, and it refuses a join that would count a metric twice. Prefer it to a duckdb join of semanticLayer nodes.
- "duckdb": DuckDB SQL over other results declared in "references".${
    enablePythonNodes
        ? `
- "python": pandas code over other results declared in "references".`
        : ''
}

A node reads only the rows its references returned, so a referenced result that reached its limit is incomplete: aggregate in the referenced node itself.`;

export const getToolComposerQueriesDescription = ({
    enablePythonNodes,
}: ComposerQueriesDescriptionOptions) => `Run a pipeline: up to ${MAX_SOURCE_QUERIES_PER_SUBMISSION} nodes submitted together, where ${
    enablePythonNodes ? 'duckdb and python' : 'duckdb'
} nodes join or transform other nodes' results. One call returns the terminal node's rows; every other submitted node is listed with its columns and first rows.

${getComposerNodeKindsDescription({
    enablePythonNodes,
    sqlNote: 'may need user approval',
})}

Reuse across calls: a node id names one node for the whole thread. To build on a node from an earlier call, read its node id in "references" without resubmitting it; it is copied into this pipeline with everything it reads and served from cache when possible. Resubmitting a node id with a different definition is an error, so give a changed node a new node id.`;

export const MCP_TOOL_QUERY_DESCRIPTION = `Run a pipeline: up to ${MAX_SOURCE_QUERIES_PER_SUBMISSION} nodes submitted together, where duckdb and python nodes join or transform other nodes' results. A pipeline of one node runs a single semantic-layer or SQL query.

${getComposerNodeKindsDescription({
    enablePythonNodes: true,
    sqlNote: 'available only when run_sql is',
})}

A python node's "code" defines \`def run(inputs, params)\`, and semanticLayer "filters" are flat expression strings; each field documents its contract.

Reuse earlier nodes: a result returns a sessionId once a node has finished; finished nodes are saved in it. On a follow-up, pass that sessionId and read saved nodes by node id in "references", submitting only the new nodes. Reused nodes bring everything they read and are served from cache when possible. A saved node id names one node for the whole session, so give a changed node a new node id; a failed or unfinished node is not saved, so resubmit it under the same id. Omit sessionId to start a new session.

Returns the terminal node's first rows, other submitted nodes' columns and first rows, and every node's queryUuid. If the result is running, follow up with get_query_result on each queryUuid it names; it also fetches the first page of any node's result by its queryUuid. query computes data only; it saves and charts nothing.`;

export const TOOL_COMPOSER_QUERIES_DESCRIPTION =
    getToolComposerQueriesDescription({
        enablePythonNodes: false,
    });

const nodeIdSchema = z
    .string()
    .regex(
        /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/,
        'Node ids use letters, digits and underscores, starting with a letter or underscore',
    )
    .describe('Names this node so other nodes can read its result.');

const nodeTitleSchema = z
    .string()
    .describe(
        'Short label a reader understands without seeing the query, two to five words, e.g. "Revenue by month". Shown to users instead of the node id.',
    );

const nodeDescriptionSchema = z
    .string()
    .describe(
        'One sentence for a business user on what this node does to the data, adding to the title rather than repeating it, e.g. "Sums completed order revenue per month over the last year." Shown as the node\'s heading in the pipeline list.',
    );

// Calls persisted before the description was required may carry null or none.
const persistedNodeDescriptionSchema = z.string().nullish().default(null);

// runQuery's filter-expression contract, minus table calculations: a node has
// none, DuckDB nodes do that work downstream.
export const composerSemanticLayerFiltersSchema = filterExpressionsSchema
    .omit({ tableCalculations: true })
    .strict()
    .nullish()
    .default(null)
    .describe(
        "Filters on this node's explore as flat expression strings, never structured rule objects: one for dimension fields and one for metric fields, each choosing AND or OR independently and combined with AND. Null when unfiltered, or null for an unused kind.",
    );

const composerCustomMetricSchema = z.object({
    table: z
        .string()
        .describe('Table of the base dimension; the metric belongs to it.'),
    name: z
        .string()
        .regex(
            /^[a-z][a-z0-9_]*$/,
            'Custom metric names use lowercase snake_case',
        )
        .describe(
            'snake_case name. The metric\'s field id is "<table>_<name>"; defining it selects it, and the id works in sorts, metric filters and periodComparisons.',
        ),
    label: z.string().describe('Column label shown to users.'),
    description: z
        .string()
        .nullish()
        .describe(
            "Shown to users as the metric's description. Null when the label is enough.",
        ),
    aggregation: z
        .enum([
            MetricType.SUM,
            MetricType.AVERAGE,
            MetricType.COUNT,
            MetricType.COUNT_DISTINCT,
            MetricType.MIN,
            MetricType.MAX,
            MetricType.MEDIAN,
            MetricType.PERCENTILE,
        ])
        .describe(
            'Aggregation over the base dimension. Number dimensions take any; string, date and timestamp dimensions take count, count_distinct, min or max; boolean dimensions take count or count_distinct.',
        ),
    dimensionFieldId: z
        .string()
        .describe(
            'Field id of the dimension to aggregate, a dimension of "table".',
        ),
    percentile: z
        .number()
        .min(0)
        .max(100)
        .nullish()
        .describe('0–100, set only for the percentile aggregation.'),
    filter: filterExpressionInputSchema
        .nullish()
        .describe(
            'Aggregates only the rows this flat AND expression over dimensions matches, in the node filter grammar, e.g. `orders_status equals="completed"`. Null aggregates every row.',
        ),
});

const composerPeriodComparisonSchema = z.object({
    metricFieldId: z
        .string()
        .describe(
            'Metric to compare: a field id in "metrics" or a custom metric\'s.',
        ),
    timeDimensionFieldId: z
        .string()
        .describe(
            'Time dimension in "dimensions" with a day, week, month, quarter or year grain; the offset counts in that grain.',
        ),
    periodOffset: z.coerce
        .number()
        .int()
        .min(1)
        .describe(
            'Periods to look back: 1 for the previous period, 12 on a month grain for the same month last year.',
        ),
});

export type ToolComposerCustomMetric = z.infer<
    typeof composerCustomMetricSchema
>;
export type ToolComposerPeriodComparison = z.infer<
    typeof composerPeriodComparisonSchema
>;

const sortFieldSchema = z.object({
    fieldId: z.string().describe('Field id to sort by.'),
    descending: z
        .boolean()
        .describe('If true sorts in descending order, ascending otherwise.'),
});

const referencedNodeIdSchema = z
    .string()
    .regex(
        /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/,
        'References name node ids (letters, digits and underscores), not query ids',
    );

const referencesSchema = z.union([
    z.array(referencedNodeIdSchema),
    z.record(z.string(), referencedNodeIdSchema),
]);

type CreateToolComposerQueriesArgsSchemaOptions = {
    maxLimit?: number;
    defaultLimit?: number;
    /** Offers the python node; only when python queries are enabled for the org. */
    enablePythonNodes?: boolean;
    /** Persisted calls predate the required description; only new input requires it. */
    persisted?: boolean;
    /** Parses api nodes, which only threads from before live data source explores hold. */
    enableApiNodes?: boolean;
};

const mergeCalculationFormatSchema = z.object({
    type: z
        .enum(['number', 'percent', 'currency'])
        .describe('"percent" shows 0.12 as 12%.'),
    currency: z
        .string()
        .nullish()
        .default(null)
        .describe(
            'ISO code for "currency", the governed metric\'s currency (e.g. "USD"). null otherwise.',
        ),
    decimals: z
        .number()
        .int()
        .min(0)
        .max(6)
        .nullish()
        .default(null)
        .describe('Decimal places. null keeps the default.'),
});
// Calls persisted before the format object carry "number" or "percent".
const persistedMergeCalculationFormatSchema = z.union([
    mergeCalculationFormatSchema,
    z.enum(['number', 'percent']),
]);

export const createToolComposerQueriesArgsSchemaV1 = ({
    maxLimit = DEFAULT_COMPOSER_QUERY_MAX_LIMIT,
    defaultLimit = DEFAULT_COMPOSER_QUERY_LIMIT,
    enablePythonNodes = false,
    persisted = false,
    enableApiNodes = false,
}: CreateToolComposerQueriesArgsSchemaOptions = {}) => {
    const nodeMetaSchema = {
        title: nodeTitleSchema,
        description: persisted
            ? persistedNodeDescriptionSchema
            : nodeDescriptionSchema,
    };
    const limitSchema = z.coerce
        .number()
        .int()
        .positive()
        .max(maxLimit)
        .default(defaultLimit)
        .describe(
            `Maximum number of rows this node returns. Defaults to ${defaultLimit}, max ${maxLimit}.`,
        );

    const semanticLayerNodeSchema = z.object({
        sourceType: z.literal(QuerySourceType.SEMANTIC_LAYER),
        nodeId: nodeIdSchema,
        ...nodeMetaSchema,
        exploreName: z
            .string()
            .describe('The explore to run the metric query against.'),
        dimensions: z
            .array(z.string())
            .describe(
                "Dimension field ids to group by, from the explore's schema.",
            ),
        metrics: z
            .array(z.string())
            .describe(
                "Metric field ids to compute, from the explore's schema.",
            ),
        filters: composerSemanticLayerFiltersSchema,
        sorts: z
            .array(sortFieldSchema)
            .nullish()
            .default(null)
            .describe(
                'Sorts by fields this node also selects in dimensions, metrics or customMetrics, e.g. [{"fieldId": "orders_order_date", "descending": true}].',
            ),
        customMetrics: z
            .array(composerCustomMetricSchema)
            .nullish()
            .describe(
                'Metrics the explore lacks, each an aggregation over one of its dimensions, computed in this query.',
            ),
        periodComparisons: z
            .array(composerPeriodComparisonSchema)
            .nullish()
            .describe(
                'Each adds a column holding a metric shifted back in time, next to that metric, e.g. revenue the same month last year. The warehouse reads the earlier period even when the filters exclude it. The column id is generated; read it from the result columns.',
            ),
        parameters: z
            .record(z.string(), parameterValueSchema)
            .nullish()
            .describe(
                'Parameter values for this node, keyed by parameter name exactly as shown in the explore metadata (e.g. {"orders.metric": "active_users"}). Set them whenever a selected field is marked "requires parameters" and the default does not match what the user asked for: an unset parameter silently resolves to its default, which can return the wrong data. null when the explore has no parameters or the defaults are correct.',
            ),
        limit: limitSchema,
    });

    const sqlNodeSchema = z.object({
        sourceType: z.literal(QuerySourceType.SQL),
        nodeId: nodeIdSchema,
        ...nodeMetaSchema,
        sql: z
            .string()
            .describe(
                "A SELECT or WITH statement in the warehouse's SQL dialect.",
            ),
        limit: limitSchema,
    });

    const duckdbNodeSchema = z.object({
        sourceType: z.literal(QuerySourceType.DUCKDB),
        nodeId: nodeIdSchema,
        ...nodeMetaSchema,
        sql: z
            .string()
            .describe(
                `DuckDB SQL over the tables "references" exposes. ${DUCKDB_ALIAS_GUIDANCE}`,
            ),
        references: referencesSchema.describe(
            'Which nodes the SQL reads, by node id: an array (each exposed as a table named by its node id), or a map of {tableName: nodeId} to alias them.',
        ),
        limit: limitSchema,
    });

    const mergeNodeSchema = z.object({
        sourceType: z.literal(QuerySourceType.MERGE),
        nodeId: nodeIdSchema,
        ...nodeMetaSchema,
        sources: z
            .array(
                z.object({
                    nodeId: referencedNodeIdSchema.describe(
                        'A semanticLayer node of this call or of the thread.',
                    ),
                    repeatValues: z
                        .boolean()
                        .nullish()
                        .default(null)
                        .describe(
                            "true repeats this node's values on every row of the one source that keeps a dimension outside the join key, e.g. a monthly target beside daily sales. Every source but that one sets it. null otherwise.",
                        ),
                }),
            )
            .min(2)
            .describe(
                "The semanticLayer nodes to merge, in order; a left join keeps the first one's rows. Each node selects its join-key dimensions plus metrics; one source may keep another dimension when every other source sets repeatValues. Each returns fewer rows than its limit: a node cut off at its limit is refused.",
            ),
        joinKey: z
            .array(
                z.object({
                    name: z
                        .string()
                        .regex(
                            /^[a-z][a-z0-9_]*$/,
                            'Join key names use lowercase snake_case',
                        )
                        .describe(
                            'snake_case name of the shared key column, which the result calls merge_<name>.',
                        ),
                    fields: z
                        .array(
                            z.object({
                                nodeId: referencedNodeIdSchema,
                                fieldId: z
                                    .string()
                                    .describe('A dimension that node selects.'),
                            }),
                        )
                        .min(2)
                        .describe(
                            'One dimension per source, the same value at the same grain (both a month, both a customer id).',
                        ),
                }),
            )
            .min(1)
            .describe('The dimensions the sources share, one entry per key.'),
        joinType: z
            .enum(MergeJoinType)
            .describe(
                '"full" keeps keys found in any source, "left" keeps the first source\'s keys, "inner" keeps keys found in every source.',
            ),
        tableCalculations: z
            .array(
                z.object({
                    name: z
                        .string()
                        .regex(
                            /^[a-z][a-z0-9_]*$/,
                            'Calculation names use lowercase snake_case',
                        )
                        .describe(
                            'snake_case name; the result calls it merge_<name>.',
                        ),
                    displayName: z.string().describe('Column label.'),
                    formula: z
                        .string()
                        .describe(
                            "Spreadsheet formula over merged columns by id: `<source nodeId>_<fieldId>` for a source's column, `merge_<name>` for a join key. Sources `weekly_orders` and `weekly_sessions` give `weekly_orders_orders_total_revenue / weekly_sessions_sessions_count`. It supports: arithmetic across sources (dividing by zero gives blank); a blank-safe sum, `COALESCE(a, 0) + COALESCE(b, 0)`; SUM, AVG, MIN, MAX and COUNT over all rows, so `a / SUM(a)` is a share of total, and `SUM(a) OVER (PARTITION BY merge_<name>)` a group's total; LAG, LEAD, RUNNING_TOTAL, MOVING_AVG and RANK, each naming its order, as in `a / LAG(a, PARTITION BY merge_category, ORDER BY merge_year) - 1` for year on year; conditions with IF, ISNULL, comparisons and AND/OR between them; ROUND and ABS.",
                        ),
                    format: (persisted
                        ? persistedMergeCalculationFormatSchema
                        : mergeCalculationFormatSchema
                    )
                        .nullish()
                        .default(null)
                        .describe(
                            'How the column displays: match the metrics it is built from, so a revenue ratio is currency and a share is percent. null shows a plain number.',
                        ),
                }),
            )
            .nullish()
            .default(null)
            .describe(
                'Every calculation over the merged columns: ratios, year on year, shares of total, conditional labels. null for none.',
            ),
        sorts: z
            .array(sortFieldSchema)
            .nullish()
            .default(null)
            .describe(
                'Sorts by merged column id (`merge_<name>`, `<source nodeId>_<fieldId>`). null sorts by every join key, in order.',
            ),
        limit: limitSchema,
    });

    const externalNodeSchema = z.object({
        sourceType: z.literal(QuerySourceType.EXTERNAL),
        nodeId: nodeIdSchema,
        ...nodeMetaSchema,
        sql: z
            .string()
            .describe(
                `DuckDB SQL over the tables "tables" declares. ${DUCKDB_ALIAS_GUIDANCE}`,
            ),
        tables: z
            .union([z.array(z.string()), z.record(z.string(), z.string())])
            .describe(
                'External tables this node reads: an array of table names (each exposed under its name), or a map of {sqlAlias: tableNameOrTableUuid}. Prefer table UUIDs from attached-source context so renames cannot break the query.',
            ),
        limit: limitSchema,
    });

    const pythonNodeSchema = z.object({
        sourceType: z.literal(QuerySourceType.PYTHON),
        nodeId: nodeIdSchema,
        ...nodeMetaSchema,
        code: z.string().describe(PYTHON_CODE_DESCRIPTION),
        references: referencesSchema.describe(
            'Which nodes the code reads, at least one, by node id: an array (each exposed as inputs[nodeId]), or a map of {inputName: nodeId} to alias them.',
        ),
        limit: limitSchema,
    });

    const apiNodeSchema = z.object({
        sourceType: z.literal(QuerySourceType.API),
        nodeId: nodeIdSchema,
        ...nodeMetaSchema,
        connectionUuid: z
            .string()
            .describe(
                'The project connection the query is sent to, from the list in the tool description.',
            ),
        payload: z
            .object({
                kind: z.literal('query'),
                query: z.string().describe(getLiveSourceAgentQueryGuide()),
            })
            .describe('What the API runs.'),
        limit: limitSchema,
    });

    const baseNodeSchemas = [
        semanticLayerNodeSchema,
        sqlNodeSchema,
        duckdbNodeSchema,
        externalNodeSchema,
        mergeNodeSchema,
    ] as const;
    const sourceQueryNodeSchema = z.discriminatedUnion('sourceType', [
        ...baseNodeSchemas,
        ...(enablePythonNodes ? [pythonNodeSchema] : []),
        ...(enableApiNodes ? [apiNodeSchema] : []),
    ]);

    return createToolSchema()
        .extend({
            title: z
                .string()
                .nullish()
                .default(null)
                .describe('A short title for the result.'),
            description: z
                .string()
                .nullish()
                .default(null)
                .describe(
                    'A one-line description of what the pipeline computes.',
                ),
            queries: z
                .array(sourceQueryNodeSchema)
                .min(1)
                .describe(
                    `The nodes to submit, in any order: reads are resolved from ${
                        enablePythonNodes ? 'duckdb and python' : 'duckdb'
                    } references and merge sources.`,
                ),
            terminalNodeId: z
                .string()
                .nullish()
                .default(null)
                .describe(
                    'The terminal node. Null picks the last submitted node no other submitted node reads; a node id returns that node of the pipeline instead, including a node from an earlier call.',
                ),
        })
        .build();
};

// The advertised contract; python and api nodes and the row limit are runtime-selected.
export const createToolComposerQueriesArgsSchema =
    createToolComposerQueriesArgsSchemaV1;

export const toolComposerQueriesArgsSchema =
    createToolComposerQueriesArgsSchema();

// Calls persisted before node filters became expressions carry free-form
// filters; parse those nodes unfiltered rather than dropping the call.
const dropLegacyComposerNodeFilters = (input: unknown): unknown => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return input;
    }
    const { queries } = input as { queries?: unknown };
    if (!Array.isArray(queries)) return input;
    return {
        ...input,
        queries: queries.map((node: unknown) =>
            node &&
            typeof node === 'object' &&
            'sourceType' in node &&
            node.sourceType === QuerySourceType.SEMANTIC_LAYER &&
            'filters' in node &&
            !composerSemanticLayerFiltersSchema.safeParse(node.filters).success
                ? { ...node, filters: null }
                : node,
        ),
    };
};

// Wide contract for parsing persisted args, never advertised. Same evolution
// rules as toolRunQueryArgsSchemaPersisted: additive fields are nullish with a
// default; a restructure adds V(N) and this alias keeps parsing every version.
export const toolComposerQueriesArgsSchemaPersisted = z.preprocess(
    dropLegacyComposerNodeFilters,
    createToolComposerQueriesArgsSchemaV1({
        enablePythonNodes: true,
        enableApiNodes: true,
        maxLimit: Number.MAX_SAFE_INTEGER,
        persisted: true,
    }),
);

export type ToolComposerQueryNode = z.infer<
    ReturnType<typeof createToolComposerQueriesArgsSchema>
>['queries'][number];

export type ToolComposerSemanticLayerNode = Extract<
    ToolComposerQueryNode,
    { sourceType: QuerySourceType.SEMANTIC_LAYER }
>;

// A submitted node with semanticLayer filters and custom metrics resolved to
// the metric query's shape; only this shape converts to a SourceQuery.
export type ResolvedToolComposerQueryNode =
    | Exclude<ToolComposerQueryNode, ToolComposerSemanticLayerNode>
    | (Omit<
          ToolComposerSemanticLayerNode,
          'filters' | 'customMetrics' | 'periodComparisons'
      > & {
          filters: Filters | null;
          additionalMetrics: AdditionalMetric[];
      });

const toSourceQueryNodeMeta = (
    node: ResolvedToolComposerQueryNode,
): Pick<SqlSourceQuery, 'title' | 'description'> => ({
    title: node.title,
    description: node.description ?? undefined,
});

/**
 * Converts a validated tool node into the canonical SourceQuery shape the
 * query source service takes. The explicit return types pin drift at compile
 * time: if types/querySources.ts changes incompatibly, this stops compiling.
 */
/** A SourceQuery built from a tool node, so its node id is always set. */
export type SubmittedSourceQuery = (
    | SemanticLayerSourceQuery
    | SqlSourceQuery
    | DuckdbSourceQuery
    | ExternalSourceQuery
    | PythonSourceQuery
    | ApiSourceQuery
    | MergeSourceQuery
) & { nodeId: QueryNodeId };

type ToolComposerMergeNode = Extract<
    ToolComposerQueryNode,
    { sourceType: QuerySourceType.MERGE }
>;

const toMergeCalculationFormat = (
    format: NonNullable<
        ToolComposerMergeNode['tableCalculations']
    >[number]['format'],
): CustomFormat => {
    if (format === null || format === 'number') {
        return {
            type: CustomFormatType.NUMBER,
            separator: NumberSeparator.DEFAULT,
        };
    }
    if (format === 'percent') {
        return {
            type: CustomFormatType.PERCENT,
            separator: NumberSeparator.DEFAULT,
        };
    }
    const currency = currencies.find((code) => code === format.currency);
    const decimals = format.decimals !== null ? { round: format.decimals } : {};
    if (format.type === 'currency' && currency) {
        return {
            type: CustomFormatType.CURRENCY,
            separator: NumberSeparator.DEFAULT,
            currency,
            ...decimals,
        };
    }
    return {
        type:
            format.type === 'percent'
                ? CustomFormatType.PERCENT
                : CustomFormatType.NUMBER,
        separator: NumberSeparator.DEFAULT,
        ...decimals,
    };
};

const toMergeTableCalculation = (
    calculation: NonNullable<
        ToolComposerMergeNode['tableCalculations']
    >[number],
): MergeTableCalculation => ({
    name: calculation.name,
    displayName: calculation.displayName,
    sql: '',
    formula: withLeadingEquals(calculation.formula),
    format: toMergeCalculationFormat(calculation.format),
});

const toolComposerMergeNodeToSourceQuery = (
    node: ToolComposerMergeNode,
): MergeSourceQuery & { nodeId: QueryNodeId } => ({
    sourceType: node.sourceType,
    nodeId: node.nodeId,
    ...toSourceQueryNodeMeta(node),
    sources: node.sources.map(({ nodeId, repeatValues }) => ({
        nodeId,
        ...(repeatValues ? { repeatValues: true } : {}),
    })),
    joinKey: node.joinKey.map(({ name, fields }) => ({
        name,
        fieldIdBySourceId: Object.fromEntries(
            fields.map(({ nodeId, fieldId }) => [nodeId, fieldId]),
        ),
    })),
    joinType: node.joinType,
    ...(node.tableCalculations?.length
        ? {
              tableCalculations: node.tableCalculations.map(
                  toMergeTableCalculation,
              ),
          }
        : {}),
    // Unsorted, every key orders the rows, not only the first
    sorts: node.sorts?.length
        ? node.sorts
        : node.joinKey.map(({ name }) => ({
              fieldId: getItemId({ table: MERGE_TABLE_NAME, name }),
              descending: false,
          })),
    limit: node.limit,
});

export const toolComposerQueryNodeToSourceQuery = (
    node: ResolvedToolComposerQueryNode,
): SubmittedSourceQuery => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER: {
            const filters: MetricQueryRequest['filters'] | undefined =
                node.filters ?? undefined;
            const sorts: SortField[] | undefined = node.sorts ?? undefined;
            const parameters: ParametersValuesMap | undefined =
                node.parameters && Object.keys(node.parameters).length > 0
                    ? node.parameters
                    : undefined;
            return {
                sourceType: node.sourceType,
                nodeId: node.nodeId,
                ...toSourceQueryNodeMeta(node),
                exploreName: node.exploreName,
                dimensions: node.dimensions,
                metrics: node.metrics,
                filters,
                sorts,
                parameters,
                ...(node.additionalMetrics.length > 0
                    ? { additionalMetrics: node.additionalMetrics }
                    : {}),
                limit: node.limit,
            };
        }
        case QuerySourceType.SQL:
            return {
                sourceType: node.sourceType,
                nodeId: node.nodeId,
                ...toSourceQueryNodeMeta(node),
                sql: node.sql,
                limit: node.limit,
            };
        case QuerySourceType.DUCKDB:
            return {
                sourceType: node.sourceType,
                nodeId: node.nodeId,
                ...toSourceQueryNodeMeta(node),
                sql: node.sql,
                references: node.references,
                limit: node.limit,
            };
        case QuerySourceType.EXTERNAL:
            return {
                sourceType: node.sourceType,
                nodeId: node.nodeId,
                ...toSourceQueryNodeMeta(node),
                sql: node.sql,
                tables: node.tables,
                limit: node.limit,
            };
        case QuerySourceType.PYTHON:
            return {
                sourceType: node.sourceType,
                nodeId: node.nodeId,
                ...toSourceQueryNodeMeta(node),
                code: node.code,
                references: node.references,
                limit: node.limit,
            };
        case QuerySourceType.API:
            return {
                sourceType: node.sourceType,
                nodeId: node.nodeId,
                ...toSourceQueryNodeMeta(node),
                connectionUuid: node.connectionUuid,
                payload: node.payload,
                limit: node.limit,
            };
        case QuerySourceType.MERGE:
            return toolComposerMergeNodeToSourceQuery(node);
        default:
            return assertUnreachable(node, 'Unknown composer query node');
    }
};

const asStringArray = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];

const asReferenceMapOrArray = (
    value: unknown,
): string[] | Record<string, string> => {
    if (Array.isArray(value)) return asStringArray(value);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        );
    }
    return [];
};

/**
 * Lenient parse of partially-streamed composer args so the pipeline renders
 * while the model is still writing it. Nodes are kept as soon as they have a
 * nodeId and a known sourceType; every other field falls back to an empty
 * default (e.g. a half-written SQL string renders as-is and grows with the
 * stream). Returns null when nothing is renderable yet. Never use the result
 * for execution — only the strict schema validates a runnable pipeline.
 */
export const parsePartialToolComposerQueriesArgs = (
    input: unknown,
): ToolComposerQueriesArgs | null => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return null;
    }
    const raw = input as Record<string, unknown>;
    const rawQueries = Array.isArray(raw.queries) ? raw.queries : [];
    const queries = rawQueries.flatMap<ToolComposerQueryNode>((rawNode) => {
        if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) {
            return [];
        }
        const node = rawNode as Record<string, unknown>;
        const { nodeId } = node;
        if (typeof nodeId !== 'string' || nodeId.length === 0) return [];
        const sql = typeof node.sql === 'string' ? node.sql : '';
        const meta = {
            nodeId,
            // Title falls back to the node id until it streams in
            title: typeof node.title === 'string' ? node.title : nodeId,
            description:
                typeof node.description === 'string' ? node.description : null,
        };
        switch (node.sourceType) {
            case QuerySourceType.SEMANTIC_LAYER:
                return [
                    {
                        sourceType: QuerySourceType.SEMANTIC_LAYER,
                        ...meta,
                        exploreName:
                            typeof node.exploreName === 'string'
                                ? node.exploreName
                                : '',
                        dimensions: asStringArray(node.dimensions),
                        metrics: asStringArray(node.metrics),
                        filters: null,
                        sorts: null,
                        parameters: null,
                        limit: DEFAULT_COMPOSER_QUERY_LIMIT,
                    },
                ];
            case QuerySourceType.SQL:
                return [
                    {
                        sourceType: QuerySourceType.SQL,
                        ...meta,
                        sql,
                        limit: DEFAULT_COMPOSER_QUERY_LIMIT,
                    },
                ];
            case QuerySourceType.DUCKDB:
                return [
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        ...meta,
                        sql,
                        references: asReferenceMapOrArray(node.references),
                        limit: DEFAULT_COMPOSER_QUERY_LIMIT,
                    },
                ];
            case QuerySourceType.EXTERNAL:
                return [
                    {
                        sourceType: QuerySourceType.EXTERNAL,
                        ...meta,
                        sql,
                        tables: asReferenceMapOrArray(node.tables),
                        limit: DEFAULT_COMPOSER_QUERY_LIMIT,
                    },
                ];
            case QuerySourceType.PYTHON:
                return [
                    {
                        sourceType: QuerySourceType.PYTHON,
                        ...meta,
                        code: typeof node.code === 'string' ? node.code : '',
                        references: asReferenceMapOrArray(node.references),
                        limit: DEFAULT_COMPOSER_QUERY_LIMIT,
                    },
                ];
            case QuerySourceType.MERGE:
                return [
                    {
                        sourceType: QuerySourceType.MERGE,
                        ...meta,
                        sources: asStringArray(
                            Array.isArray(node.sources)
                                ? node.sources.map((source: unknown) =>
                                      source &&
                                      typeof source === 'object' &&
                                      'nodeId' in source
                                          ? source.nodeId
                                          : null,
                                  )
                                : [],
                        ).map((sourceNodeId) => ({
                            nodeId: sourceNodeId,
                            repeatValues: null,
                        })),
                        joinKey: [],
                        joinType: MergeJoinType.FULL,
                        tableCalculations: null,
                        sorts: null,
                        limit: DEFAULT_COMPOSER_QUERY_LIMIT,
                    },
                ];
            case QuerySourceType.API: {
                if (typeof node.connectionUuid !== 'string') return [];
                const payload =
                    node.payload && typeof node.payload === 'object'
                        ? (node.payload as Record<string, unknown>)
                        : {};
                return [
                    {
                        sourceType: QuerySourceType.API,
                        ...meta,
                        connectionUuid: node.connectionUuid,
                        payload: {
                            kind: 'query',
                            query:
                                typeof payload.query === 'string'
                                    ? payload.query
                                    : '',
                        },
                        limit: DEFAULT_COMPOSER_QUERY_LIMIT,
                    },
                ];
            }
            default:
                return [];
        }
    });
    if (queries.length === 0) return null;
    return {
        title: typeof raw.title === 'string' ? raw.title : null,
        description:
            typeof raw.description === 'string' ? raw.description : null,
        queries,
        terminalNodeId:
            typeof raw.terminalNodeId === 'string' ? raw.terminalNodeId : null,
    };
};

const composerQueryColumnSchema = z.object({
    reference: z.string().describe('Column name as it appears in the rows.'),
    type: z.nativeEnum(DimensionType),
});

const composerQueryNodeSummarySchema = z.object({
    nodeId: nodeIdSchema,
    title: z.string().nullable().describe('What users see for this node.'),
    sourceType: z.nativeEnum(QuerySourceType),
    rowCount: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .describe('Rows this node returned; null when its query is not ready.'),
    limit: z
        .number()
        .int()
        .positive()
        .describe(
            'Row limit this node ran with. A rowCount equal to it means the node reached its limit, so more rows may exist.',
        ),
    columns: z
        .array(composerQueryColumnSchema)
        .nullable()
        .describe(
            'Columns of a node submitted in this call; null for reused nodes and for the terminal node, whose columns are in columns.',
        ),
    sample: z
        .array(z.record(z.string(), z.unknown()))
        .nullable()
        .describe(
            `First rows of a node submitted in this call other than the terminal node: ${COMPOSER_NODE_SAMPLE_ROW_LIMIT}, more for a node no other node reads; null otherwise or when data access is disabled.`,
        ),
});

export const toolComposerQueriesStructuredContentSchema = z.object({
    terminalNodeId: nodeIdSchema.describe('Node whose rows are returned.'),
    rowCount: z
        .number()
        .int()
        .nonnegative()
        .describe('Total rows in the terminal result, before any preview cap.'),
    nodes: z
        .array(composerQueryNodeSummarySchema)
        .describe(
            'Every node of the pipeline that ran, including reused nodes, in dependency order. A later call can read any of them by node id.',
        ),
    columns: z
        .array(composerQueryColumnSchema)
        .describe('Terminal result columns, in order.'),
    parameters: z
        .array(appliedParametersSchema.extend({ nodeId: nodeIdSchema }))
        .describe(
            'The parameter state each semanticLayer node of the pipeline ran with; only nodes whose explore references parameters.',
        ),
    preview: z
        .object({
            rows: z
                .array(z.record(z.string(), z.unknown()))
                .describe(
                    'Terminal rows keyed by column reference, capped to the first rows of the result.',
                ),
            truncated: z
                .boolean()
                .describe(
                    'True when rowCount exceeds the preview cap, so rows is only a prefix of the result.',
                ),
        })
        .nullable()
        .describe(
            'Raw values of the preview rows rendered as CSV in the result; null when data access is disabled or the terminal result is empty.',
        ),
    review: z.string().nullable(),
});

export const mcpQueryStructuredOutputSchema = z.object({
    sessionId: z
        .string()
        .nullable()
        .describe(
            'Composer session holding the ready nodes; pass it as sessionId to read them by node id in a later call. Null when no node was saved and no sessionId was passed.',
        ),
    status: z
        .enum(['done', 'running'])
        .describe(
            'running when a node outlived the wait; poll get_query_result with the queryUuids the result names.',
        ),
    terminalNodeId: nodeIdSchema.describe('Node whose rows are previewed.'),
    rowCount: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .describe('Total rows in the terminal result; null while running.'),
    nodes: z
        .array(
            composerQueryNodeSummarySchema.extend({
                queryUuid: z
                    .string()
                    .describe('Pass to get_query_result to read this node.'),
                status: z.enum(['done', 'running', 'failed']),
                reachedLimit: z
                    .boolean()
                    .describe(
                        'True when rowCount reached limit, so more rows may exist and nodes reading it may be computed on incomplete rows.',
                    ),
                columns: z
                    .array(composerQueryColumnSchema)
                    .nullable()
                    .describe(
                        'Result columns of the terminal node and of nodes submitted in this call; null for reused nodes and until the node is done.',
                    ),
                sample: z
                    .array(z.record(z.string(), z.unknown()))
                    .nullable()
                    .describe(
                        `First rows of a done node submitted in this call other than the terminal node: ${COMPOSER_NODE_SAMPLE_ROW_LIMIT}, more for a node no other node reads; null for the terminal node and for reused, failed or unfinished nodes.`,
                    ),
            }),
        )
        .describe('Every node of the pipeline, in dependency order.'),
});

export type McpQueryStructuredContent = z.infer<
    typeof mcpQueryStructuredOutputSchema
>;

const toolComposerQueriesSuccessMetadataSchema = z.object({
    status: z.literal('success'),
    queryUuid: z.string(),
    terminalNodeId: nodeIdSchema.describe('Node whose rows are returned.'),
    title: z.string(),
    description: z.string().nullable(),
});

export type ToolComposerQueriesSuccessMetadata = z.infer<
    typeof toolComposerQueriesSuccessMetadataSchema
>;

export const parseToolComposerQueriesSuccessMetadata = (
    metadata: unknown,
): ToolComposerQueriesSuccessMetadata | null => {
    const parsed = toolComposerQueriesSuccessMetadataSchema.safeParse(metadata);
    return parsed.success ? parsed.data : null;
};

export const toolComposerQueriesOutputSchema = structuredToolOutputSchema({
    metadata: z.discriminatedUnion('status', [
        toolComposerQueriesSuccessMetadataSchema,
        z.object({ status: z.enum(['error', 'rejected', 'timeout']) }),
    ]),
    structuredContent: toolComposerQueriesStructuredContentSchema,
    // Rejection and timeout are failures for this tool: they carry an error,
    // not a result set.
    errorStatuses: z.enum(['error', 'rejected', 'timeout']),
});

export type ToolComposerQueriesArgs = z.infer<
    ReturnType<typeof createToolComposerQueriesArgsSchema>
>;
export type ToolComposerQueriesOutput = z.infer<
    typeof toolComposerQueriesOutputSchema
>;
export type ToolComposerQueriesStructuredContent = z.infer<
    typeof toolComposerQueriesStructuredContentSchema
>;
