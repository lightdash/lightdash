import { z } from 'zod';
import { DimensionType } from '../../../../types/field';
import { type Filters } from '../../../../types/filter';
import {
    type MetricQueryRequest,
    type SortField,
} from '../../../../types/metricQuery';
import { type ParametersValuesMap } from '../../../../types/parameters';
import {
    QuerySourceType,
    type DuckdbSourceQuery,
    type ExternalSourceQuery,
    type PythonSourceQuery,
    type QueryNodeId,
    type SemanticLayerSourceQuery,
    type SqlSourceQuery,
} from '../../../../types/querySources';
import assertUnreachable from '../../../../utils/assertUnreachable';
import { filterExpressionsSchema } from '../filterExpressions/expressionSchemas';
import { structuredToolOutputSchema } from '../outputMetadata';
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

type ComposerQueriesDescriptionOptions = {
    enablePythonNodes: boolean;
};

export const getToolComposerQueriesDescription = ({
    enablePythonNodes,
}: ComposerQueriesDescriptionOptions) => `Run a pipeline: one or more nodes submitted together, where ${
    enablePythonNodes ? 'duckdb and python' : 'duckdb'
} nodes join or transform other nodes' results. The terminal node's rows are returned to you.

Node kinds:
- "semanticLayer": a metric query against an explore. Result columns are the requested field ids.
- "sql": raw SQL against the project warehouse; may need user approval.
- "external": DuckDB SQL over uploaded or connected tables declared in "tables".
- "duckdb": DuckDB SQL over other results declared in "references".${
    enablePythonNodes
        ? `
- "python": pandas code over other results declared in "references".`
        : ''
}

A node reads only the rows its references returned, so a referenced result that reached its limit is incomplete: before totalling, averaging or ranking over it, give that node a limit that holds its whole population, or aggregate there.

Reuse across calls: a node id names one node for the whole thread. To build on a node from an earlier call, read its node id in "references" without resubmitting it; it is copied into this pipeline with everything it reads and served from cache when possible. Resubmitting a node id with a different definition is an error, so give a changed node a new node id.

Results stay hidden until you present one; each successful result says how.`;

export const TOOL_COMPOSER_QUERIES_DESCRIPTION =
    getToolComposerQueriesDescription({ enablePythonNodes: false });

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
    .nullable()
    .describe(
        'One sentence on what this query does, only when the title is not enough. Null otherwise.',
    );

const nodeMetaSchema = {
    title: nodeTitleSchema,
    description: nodeDescriptionSchema,
};

// runQuery's filter-expression contract, minus table calculations: a node has
// none, DuckDB nodes do that work downstream.
export const composerSemanticLayerFiltersSchema = filterExpressionsSchema
    .omit({ tableCalculations: true })
    .strict()
    .nullable()
    .describe(
        "Filters on this node's explore as flat expression strings, never structured rule objects: one for dimension fields and one for metric fields, each choosing AND or OR independently and combined with AND. Null when unfiltered, or null for an unused kind.",
    );

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
};

export const createToolComposerQueriesArgsSchemaV1 = ({
    maxLimit = DEFAULT_COMPOSER_QUERY_MAX_LIMIT,
    defaultLimit = DEFAULT_COMPOSER_QUERY_LIMIT,
    enablePythonNodes = false,
}: CreateToolComposerQueriesArgsSchemaOptions = {}) => {
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
            .nullable()
            .describe(
                'Sorts by fields this node also selects in dimensions or metrics, e.g. [{"fieldId": "orders_order_date", "descending": true}].',
            ),
        parameters: z
            .record(z.string(), parameterValueSchema)
            .nullable()
            .default(null)
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
            .describe('DuckDB SQL over the tables "references" exposes.'),
        references: referencesSchema.describe(
            'Which nodes the SQL reads, by node id: an array (each exposed as a table named by its node id), or a map of {tableName: nodeId} to alias them.',
        ),
        limit: limitSchema,
    });

    const externalNodeSchema = z.object({
        sourceType: z.literal(QuerySourceType.EXTERNAL),
        nodeId: nodeIdSchema,
        ...nodeMetaSchema,
        sql: z
            .string()
            .describe('DuckDB SQL over the tables "tables" declares.'),
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
        code: z
            .string()
            .describe(
                `Python defining \`def run(inputs: dict[str, pandas.DataFrame], params: dict) -> pandas.DataFrame\`. params is empty. Available libraries: pandas, numpy, scipy, pyarrow, scikit-learn, polars. No network access and no package installs. Polars results must be converted back with .to_pandas(). Return one DataFrame whose column names match ^[A-Za-z_][A-Za-z0-9_]{0,62}$. Rows past "limit" are dropped, so aggregate in Python when the output would be large.`,
            ),
        references: referencesSchema.describe(
            'Which nodes the code reads, at least one, by node id: an array (each exposed as inputs[nodeId]), or a map of {inputName: nodeId} to alias them.',
        ),
        limit: limitSchema,
    });

    const baseNodeSchemas = [
        semanticLayerNodeSchema,
        sqlNodeSchema,
        duckdbNodeSchema,
        externalNodeSchema,
    ] as const;
    const sourceQueryNodeSchema = z.discriminatedUnion(
        'sourceType',
        enablePythonNodes
            ? [...baseNodeSchemas, pythonNodeSchema]
            : [...baseNodeSchemas],
    );

    return createToolSchema()
        .extend({
            title: z
                .string()
                .nullable()
                .describe(
                    'A short title for the result, used when it is presented.',
                ),
            description: z
                .string()
                .nullable()
                .describe(
                    'A one-line description of what the pipeline computes.',
                ),
            queries: z
                .array(sourceQueryNodeSchema)
                .min(1)
                .describe(
                    `The nodes to submit, in any order: reads are resolved from ${
                        enablePythonNodes ? 'duckdb and python' : 'duckdb'
                    } references.`,
                ),
            terminalNodeId: z
                .string()
                .nullable()
                .describe(
                    'The terminal node. Null picks the unique sink, the one submitted node no other submitted node reads; name a node when there are several sinks.',
                ),
        })
        .build();
};

// The advertised contract; python nodes and the row limit are runtime-selected.
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
        maxLimit: Number.MAX_SAFE_INTEGER,
    }),
);

export type ToolComposerQueryNode = z.infer<
    ReturnType<typeof createToolComposerQueriesArgsSchema>
>['queries'][number];

export type ToolComposerSemanticLayerNode = Extract<
    ToolComposerQueryNode,
    { sourceType: QuerySourceType.SEMANTIC_LAYER }
>;

// A submitted node with semanticLayer filters already resolved to domain
// Filters; only this shape converts to a SourceQuery.
export type ResolvedToolComposerQueryNode =
    | Exclude<ToolComposerQueryNode, ToolComposerSemanticLayerNode>
    | (Omit<ToolComposerSemanticLayerNode, 'filters'> & {
          filters: Filters | null;
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
) & { nodeId: QueryNodeId };

export const toolComposerQueryNodeToSourceQuery = (
    node: ResolvedToolComposerQueryNode,
): SubmittedSourceQuery => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER: {
            const filters: MetricQueryRequest['filters'] | undefined =
                node.filters ?? undefined;
            const sorts: SortField[] | undefined = node.sorts ?? undefined;
            const parameters: ParametersValuesMap | undefined =
                node.parameters ?? undefined;
            return {
                sourceType: node.sourceType,
                nodeId: node.nodeId,
                ...toSourceQueryNodeMeta(node),
                exploreName: node.exploreName,
                dimensions: node.dimensions,
                metrics: node.metrics,
                filters,
                sorts,
                ...(parameters ? { parameters } : {}),
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

const composerQueryNodeSummarySchema = z.object({
    nodeId: nodeIdSchema,
    title: z.string().nullable().describe('What users see for this node.'),
    sourceType: z.nativeEnum(QuerySourceType),
});

const composerQueryColumnSchema = z.object({
    reference: z.string().describe('Column name as it appears in the rows.'),
    type: z.nativeEnum(DimensionType),
});

export const toolComposerQueriesStructuredContentSchema = z.object({
    terminalNodeId: nodeIdSchema.describe(
        'Node whose rows are returned and which a presentation can show.',
    ),
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
            'The parameter state each submitted semanticLayer node ran with; only nodes whose explore references parameters.',
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

const toolComposerQueriesSuccessMetadataSchema = z.object({
    status: z.literal('success'),
    queryUuid: z.string(),
    terminalNodeId: nodeIdSchema.describe('The node a presentation shows.'),
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
