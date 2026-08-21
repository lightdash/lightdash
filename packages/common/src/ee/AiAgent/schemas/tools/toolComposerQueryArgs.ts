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
    type SqlSourceQuery,
} from '../../../../types/querySources';
import assertUnreachable from '../../../../utils/assertUnreachable';
import { createToolSchema } from '../toolSchemaBuilder';

export const DEFAULT_COMPOSER_QUERY_LIMIT = 500;
export const DEFAULT_COMPOSER_QUERY_MAX_LIMIT = 5000;

export const TOOL_COMPOSER_QUERIES_DESCRIPTION = `Execute a composer query: a pipeline of one or more queries submitted together, where DuckDB queries can join and transform the results of the other queries. Results are stored as a chart artifact that renders the terminal node's results table in the thread.

Use this tool when a single source cannot answer the question — e.g. joining a semantic layer metric query with an uploaded CSV, joining with raw warehouse SQL, or post-processing prior results with SQL. A pipeline may also be a single node: a lone "sql" node is how raw warehouse SQL runs when no standalone runSql tool is available.

How to build a pipeline:
- Every query is a node. Name each node with "nodeId" (letters, digits, underscores; starting with a letter or underscore).
- "semanticLayer" nodes run a metric query against an explore. Result columns are named by field id — exactly the dimensions and metrics requested (e.g. metric "payments_total_revenue" yields column "payments_total_revenue").
- "sql" nodes run raw SQL against the project's data warehouse, in the warehouse's SQL dialect. Result columns are the SELECT output names. SQL execution may require the user to approve the SQL first.
- "external" nodes run DuckDB SQL over durable external tables such as uploaded CSVs and connected data sources. Declare the tables via "tables": an array of table names, or a map of {sqlAlias: tableNameOrTableUuid}. Use the exact table name or UUID supplied in the user's attached-source context. One source may expose many tables, and one external node can read any subset of them. Result columns are the SELECT output names.
- "duckdb" nodes run DuckDB SQL over other queries' results. Declare which results the SQL reads via "references": the shorthand array form lists node ids from this submission, each exposed as a table named by its node id (["orders", "revenue"] lets the SQL run SELECT * FROM orders JOIN revenue ...); the map form aliases tables or references stored results by queryUuid ({"o": "orders", "prev": "<queryUuid>"}). A referenced table's columns are the upstream result's columns.
- The "terminal" node is the one whose results the artifact shows and whose rows are returned to you. By default it is the unique sink (the one node no other node references); pass "terminalNodeId" explicitly when the pipeline has multiple sinks.

Results are reusable across calls:
- Every call returns a queryUuid per node. Any of them — not just the terminal one — can be referenced by a later call via the map form of "references".
- Referencing a queryUuid reads the stored result; the query behind it is NOT re-run. A duckdb-only submission over stored results touches no source and needs no SQL approval, however many times you iterate.
- This supports step-by-step work: run a source query once, then explore its result with as many follow-up duckdb submissions over the same queryUuid as you need.
- The artifact shown in the thread always renders your LATEST call's terminal result, so finish with the submission that produces the table the user should see — referencing earlier queryUuids keeps that final pipeline small.

Returns the terminal node's result columns and a CSV preview of its rows, plus per-node queryUuids.`;

const nodeIdSchema = z
    .string()
    .regex(
        /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/,
        'Node ids use letters, digits and underscores, starting with a letter or underscore',
    )
    .describe(
        'Names this query so other queries in the same submission can reference its results. Also the DuckDB table name its results are exposed as.',
    );

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
                sql: node.sql,
                limit: node.limit,
            };
        case QuerySourceType.DUCKDB:
            return {
                sourceType: node.sourceType,
                nodeId: node.nodeId,
                sql: node.sql,
                references: node.references,
                limit: node.limit,
            };
        case QuerySourceType.EXTERNAL:
            return {
                sourceType: node.sourceType,
                nodeId: node.nodeId,
                sql: node.sql,
                tables: node.tables,
                limit: node.limit,
            };
        default:
            return assertUnreachable(node, 'Unknown composer query node');
    }
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
