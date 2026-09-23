import { z } from 'zod';
import {
    type MetricQueryRequest,
    type SortField,
} from '../../../../types/metricQuery';
import {
    QuerySourceType,
    type DuckdbSourceQuery,
    type ExternalSourceQuery,
    type SemanticLayerSourceQuery,
    type SourceQueryNodeMeta,
    type SqlSourceQuery,
} from '../../../../types/querySources';
import assertUnreachable from '../../../../utils/assertUnreachable';
import { createToolSchema } from '../toolSchemaBuilder';

export const DEFAULT_COMPOSER_QUERY_LIMIT = 500;
export const DEFAULT_COMPOSER_QUERY_MAX_LIMIT = 5000;

export const TOOL_COMPOSER_QUERIES_DESCRIPTION = `Run a pipeline: one or more queries submitted together, where duckdb queries join or transform the others' results. The terminal node's table is shown in the thread as a chart artifact and its rows are returned to you.

Node kinds:
- "semanticLayer": a metric query against an explore. Result columns are the requested field ids.
- "sql": raw SQL against the project warehouse; may need user approval. A lone sql node is how raw SQL runs when there is no runSql tool.
- "external": DuckDB SQL over uploaded or connected tables declared in "tables".
- "duckdb": DuckDB SQL over other results declared in "references".

Every node has a "nodeId" (for references) and a "title" (what users see). The terminal node is the unique sink by default, or "terminalNodeId".

Reuse across calls: every call returns a queryUuid per node. Referencing a queryUuid in the map form of "references" reads the stored result without re-running it or asking for approval. The artifact always shows your latest call's terminal result, so end with the pipeline that produces the table the user should see.`;

const nodeIdSchema = z
    .string()
    .regex(
        /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/,
        'Node ids use letters, digits and underscores, starting with a letter or underscore',
    )
    .describe(
        'Names this query so other queries in the same submission can reference its results. Also the DuckDB table name its results are exposed as.',
    );

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

const semanticLayerFiltersSchema = z
    .object({
        dimensions: z.unknown().optional(),
        metrics: z.unknown().optional(),
        tableCalculations: z.unknown().optional(),
    })
    .describe(
        'Filters in the metric query filters shape: an optional filter group per field kind, e.g. {"dimensions": {"id": "<uuid>", "and": [{"id": "<uuid>", "target": {"fieldId": "orders_status"}, "operator": "equals", "values": ["completed"]}]}}.',
    );

const sortFieldSchema = z.object({
    fieldId: z.string().describe('Field id to sort by.'),
    descending: z
        .boolean()
        .describe('If true sorts in descending order, ascending otherwise.'),
});

type CreateToolComposerQueriesArgsSchemaOptions = {
    maxLimit?: number;
    defaultLimit?: number;
};

export const createToolComposerQueriesArgsSchema = ({
    maxLimit = DEFAULT_COMPOSER_QUERY_MAX_LIMIT,
    defaultLimit = DEFAULT_COMPOSER_QUERY_LIMIT,
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
        filters: semanticLayerFiltersSchema.nullable(),
        sorts: z
            .array(sortFieldSchema)
            .nullable()
            .describe(
                'Sorts to apply, e.g. [{"fieldId": "orders_order_date", "descending": true}].',
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
                "The SQL to execute against the project's data warehouse, in the warehouse's SQL dialect. Must be a SELECT (or WITH) statement.",
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
                'DuckDB SQL over the referenced results. Each reference is exposed as a table; its columns are the upstream result columns.',
            ),
        references: z
            .union([z.array(z.string()), z.record(z.string(), z.string())])
            .describe(
                'Which query results the SQL reads. Shorthand array of node ids from this submission (each exposed as a table named by its node id), or a map of {tableName: nodeIdOrQueryUuid} for aliasing or reusing stored results from earlier calls without re-running them.',
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
                'DuckDB SQL over the declared external source tables. Each table is exposed under its name or map alias.',
            ),
        tables: z
            .union([z.array(z.string()), z.record(z.string(), z.string())])
            .describe(
                'External tables read by this query: an array of table names, or a map of {sqlAlias: tableNameOrTableUuid}. Prefer table UUIDs from attached-source context so renames cannot break the query.',
            ),
        limit: limitSchema,
    });

    const sourceQueryNodeSchema = z.discriminatedUnion('sourceType', [
        semanticLayerNodeSchema,
        sqlNodeSchema,
        duckdbNodeSchema,
        externalNodeSchema,
    ]);

    return createToolSchema()
        .extend({
            title: z
                .string()
                .nullable()
                .describe('A short title for the results artifact.'),
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
                    'The pipeline: one or more source queries submitted together. Order does not matter — dependencies are resolved from duckdb references.',
                ),
            terminalNodeId: z
                .string()
                .nullable()
                .describe(
                    "Which node's result the artifact shows and this tool returns. Pass null to default to the unique sink (the one node no other node references); required when the pipeline has multiple sinks.",
                ),
        })
        .build();
};

export const toolComposerQueriesArgsSchema =
    createToolComposerQueriesArgsSchema();

export type ToolComposerQueryNode = z.infer<
    typeof toolComposerQueriesArgsSchema
>['queries'][number];

const toSourceQueryNodeMeta = (
    node: ToolComposerQueryNode,
): SourceQueryNodeMeta => ({
    title: node.title,
    description: node.description ?? undefined,
});

/**
 * Converts a validated tool node into the canonical SourceQuery shape the
 * query source service takes. The explicit return types pin drift at compile
 * time: if types/querySources.ts changes incompatibly, this stops compiling.
 */
export const toolComposerQueryNodeToSourceQuery = (
    node: ToolComposerQueryNode,
):
    | SemanticLayerSourceQuery
    | SqlSourceQuery
    | DuckdbSourceQuery
    | ExternalSourceQuery => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER: {
            const filters: MetricQueryRequest['filters'] | undefined =
                node.filters ?? undefined;
            const sorts: SortField[] | undefined = node.sorts ?? undefined;
            return {
                sourceType: node.sourceType,
                nodeId: node.nodeId,
                ...toSourceQueryNodeMeta(node),
                exploreName: node.exploreName,
                dimensions: node.dimensions,
                metrics: node.metrics,
                filters,
                sorts,
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

export const toolComposerQueriesOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error', 'rejected', 'timeout']),
    }),
});

export type ToolComposerQueriesArgs = z.infer<
    typeof toolComposerQueriesArgsSchema
>;
export type ToolComposerQueriesOutput = z.infer<
    typeof toolComposerQueriesOutputSchema
>;
