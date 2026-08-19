import { z } from 'zod';
import { DimensionType } from '../../../../types/field';
import type { SortField } from '../../../../types/metricQuery';
import {
    QuerySourceType,
    type SourceQuery,
} from '../../../../types/querySources';
import assertUnreachable from '../../../../utils/assertUnreachable';
import { getFieldIdSchema } from '../fieldId';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import sortFieldSchema, { type ToolSortField } from '../sortField';
import { createToolSchema } from '../toolSchemaBuilder';

// Mirrors QueryNodeId / QueryResultReference / QuerySourceTableName in
// types/querySources.ts (and the backend submission validation): keep the MCP
// contract identical to the HTTP API's.
const NODE_ID_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const REFERENCE_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$/;

// Factories, not shared instances: reusing one Zod instance makes
// zodToJsonSchema emit $ref pointers, which MCP clients cannot resolve.
const createQuerySourceTypeSchema = () => z.nativeEnum(QuerySourceType);

const createNodeIdSchema = () =>
    z
        .string()
        .regex(NODE_ID_PATTERN)
        .nullable()
        .describe(
            'Optional name for this query within the submission, so other queries in the same call can reference its results (a duckdb query sees them as a table of this name). Letters, digits and underscores, starting with a letter or underscore. null to let the server generate one.',
        );

const createLimitSchema = () =>
    z.coerce
        .number()
        .int()
        .positive()
        .nullable()
        .describe(
            'Max rows to return. null uses the standard query row limit.',
        );

const semanticLayerSourceQuerySchema = z.object({
    sourceType: z.literal(QuerySourceType.SEMANTIC_LAYER),
    nodeId: createNodeIdSchema(),
    exploreName: z
        .string()
        .describe(
            'Explore to query — a table reference from the semanticLayer schema scan.',
        ),
    dimensions: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .describe(
            'Dimension field ids to group by, from the explore schema. Result columns are named by field id.',
        ),
    metrics: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .describe(
            'Metric field ids to compute, from the explore schema. Result columns are named by field id.',
        ),
    filters: filtersSchemaV2
        .nullable()
        .describe('Filters to apply. null for no filters.'),
    sorts: z
        .array(sortFieldSchema)
        .nullable()
        .describe('Sorts to apply. null for no sorts.'),
    limit: createLimitSchema(),
});

const sqlSourceQuerySchema = z.object({
    sourceType: z.literal(QuerySourceType.SQL),
    nodeId: createNodeIdSchema(),
    sql: z
        .string()
        .describe(
            'SQL to run against the project data warehouse. Result columns are named by the SELECT output names.',
        ),
    limit: createLimitSchema(),
});

const duckdbSourceQuerySchema = z.object({
    sourceType: z.literal(QuerySourceType.DUCKDB),
    nodeId: createNodeIdSchema(),
    sql: z
        .string()
        .describe(
            'DuckDB SQL selecting from the referenced results. Each reference is exposed as a table; a referenced result keeps the column names of the query that produced it (field ids for semanticLayer queries, SELECT output names for sql queries).',
        ),
    references: z
        .union([
            z.array(z.string().regex(NODE_ID_PATTERN)),
            z.record(
                z.string().regex(NODE_ID_PATTERN),
                z.string().regex(REFERENCE_PATTERN),
            ),
        ])
        .nullable()
        .describe(
            'Which query results the SQL reads. Array shorthand: node ids of queries in the same submission, each exposed as a table named by its node id. Map form for aliasing or existing results: {tableName: nodeIdOrQueryUuid}, e.g. {"o": "orders", "prev": "<queryUuid>"}. References to still-running queries are waited on inside this query.',
        ),
    limit: createLimitSchema(),
});

const sourceQuerySchema = z
    .discriminatedUnion('sourceType', [
        semanticLayerSourceQuerySchema,
        sqlSourceQuerySchema,
        duckdbSourceQuerySchema,
    ])
    .describe('One source query, tagged by sourceType.');

export const TOOL_LIST_QUERY_SOURCES_DESCRIPTION = `List the query sources registered for a project.

A query source is anything that can scan a schema and run a query returning the standard table format behind a queryUuid: the semantic layer (metric queries), raw warehouse SQL, and the DuckDB compose engine over previous results. Every source supports the same operations: scan its schema with get_query_source_schema and submit queries with run_source_queries.

Requires the multi-source-query feature flag.`;

export const TOOL_GET_QUERY_SOURCE_SCHEMA_DESCRIPTION = `Scan the schema of one query source into the standard shape: tables with columns of {reference, type}.

For the semanticLayer source, tables are explores and columns are field ids (use these ids as dimensions/metrics in run_source_queries). For the sql source, tables come from the warehouse catalog resolved for your credentials, without column detail. The duckdb source has no schema of its own — its tables are the references given to each query, and a completed query's result columns are its schema.

Requires the multi-source-query feature flag.`;

export const TOOL_RUN_SOURCE_QUERIES_DESCRIPTION = `Submit one or more source queries through the common multi-source query interface. Every query body is tagged by sourceType and every query returns a queryUuid immediately — this tool does not wait for execution.

Queries reference each other's results by nodeId: a duckdb query's references expose other queries' results as tables, named by node id (array shorthand) or by alias (map form, which also accepts queryUuids of results from previous submissions). All queries start executing immediately; a query referencing still-running results waits inside its own execution and fails if a referenced query fails, so no orchestration is needed.

Submit queries one at a time (interactive use — read a completed query's columns as the schema for your next step) or as a whole pipeline in one call; the two are equivalent. Poll submitted queries with get_source_query_status (polling only the terminal duckdb query is sufficient — its completion implies upstream completion and its error carries upstream failures), then fetch a completed query's rows with get_query_result. Results expire, so re-run upstream queries whose results have expired instead of referencing their old queryUuids.

Requires the multi-source-query feature flag.`;

export const TOOL_GET_SOURCE_QUERY_STATUS_DESCRIPTION = `Get the status of queries submitted with run_source_queries — the standard async query lifecycle plus the error message for failed queries.

Statuses: "running" (keep polling), "done" (fetch rows with get_query_result), "error", "cancelled", "expired". When polling a multi-query submission, polling only the terminal query is sufficient: its completion implies upstream completion, and its error carries upstream failures. Statuses are visible to the query creator only.`;

export const toolListQuerySourcesArgsSchema = createToolSchema().build();

export const toolGetQuerySourceSchemaArgsSchema = createToolSchema()
    .extend({
        sourceType: createQuerySourceTypeSchema().describe(
            'The query source to scan, from list_query_sources.',
        ),
    })
    .build();

export const toolRunSourceQueriesArgsSchema = createToolSchema()
    .extend({
        queries: z
            .array(sourceQuerySchema)
            .min(1)
            .max(25)
            .describe(
                'One or more source queries, submitted together. Order does not matter: queries are submitted in dependency order and every query starts executing immediately.',
            ),
    })
    .build();

export const toolGetSourceQueryStatusArgsSchema = createToolSchema()
    .extend({
        queryUuids: z
            .array(z.string().uuid())
            .min(1)
            .max(50)
            .describe(
                'Query UUIDs returned by run_source_queries to get statuses for.',
            ),
    })
    .build();

export type ToolListQuerySourcesArgs = z.infer<
    typeof toolListQuerySourcesArgsSchema
>;
export type ToolGetQuerySourceSchemaArgs = z.infer<
    typeof toolGetQuerySourceSchemaArgsSchema
>;
export type ToolRunSourceQueriesArgs = z.infer<
    typeof toolRunSourceQueriesArgsSchema
>;
export type ToolGetSourceQueryStatusArgs = z.infer<
    typeof toolGetSourceQueryStatusArgsSchema
>;

const toSortField = (sort: ToolSortField): SortField => ({
    fieldId: sort.fieldId,
    descending: sort.descending,
    ...(sort.nullsFirst === null ? {} : { nullsFirst: sort.nullsFirst }),
});

type ToolSourceQuery = z.infer<typeof sourceQuerySchema>;

// Maps a validated tool query onto the API's SourceQuery union: agent filter
// shapes become Lightdash Filters, and nulls become the omitted optionals the
// API defaults.
const toSourceQuery = (query: ToolSourceQuery): SourceQuery => {
    const base = {
        ...(query.nodeId === null ? {} : { nodeId: query.nodeId }),
        ...(query.limit === null ? {} : { limit: query.limit }),
    };
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return {
                sourceType: query.sourceType,
                ...base,
                exploreName: query.exploreName,
                dimensions: query.dimensions,
                metrics: query.metrics,
                filters: filtersSchemaTransformed.parse(query.filters),
                sorts: (query.sorts ?? []).map(toSortField),
            };
        case QuerySourceType.SQL:
            return {
                sourceType: query.sourceType,
                ...base,
                sql: query.sql,
            };
        case QuerySourceType.DUCKDB:
            return {
                sourceType: query.sourceType,
                ...base,
                sql: query.sql,
                ...(query.references === null
                    ? {}
                    : { references: query.references }),
            };
        default:
            return assertUnreachable(query, 'Unknown source query type');
    }
};

export const toolRunSourceQueriesArgsSchemaTransformed =
    toolRunSourceQueriesArgsSchema.transform((data) => ({
        ...data,
        queries: data.queries.map(toSourceQuery),
    }));

export type ToolRunSourceQueriesArgsTransformed = z.infer<
    typeof toolRunSourceQueriesArgsSchemaTransformed
>;

export const mcpListQuerySourcesStructuredOutputSchema = z.object({
    sources: z.array(
        z.object({
            sourceType: createQuerySourceTypeSchema(),
            label: z.string(),
            description: z.string(),
        }),
    ),
});

export const mcpGetQuerySourceSchemaStructuredOutputSchema = z.object({
    sourceType: createQuerySourceTypeSchema(),
    tables: z.array(
        z.object({
            reference: z.string(),
            label: z.string().nullable(),
            description: z.string().nullable(),
            columns: z.array(
                z.object({
                    reference: z.string(),
                    type: z.nativeEnum(DimensionType),
                    label: z.string().nullable(),
                    description: z.string().nullable(),
                }),
            ),
        }),
    ),
});

export const mcpRunSourceQueriesStructuredOutputSchema = z.object({
    status: z
        .literal('submitted')
        .describe(
            'All queries were submitted and are executing. Poll get_source_query_status.',
        ),
    queries: z.array(
        z.object({
            nodeId: z
                .string()
                .describe(
                    'The (possibly server-generated) node id of this query.',
                ),
            sourceType: createQuerySourceTypeSchema(),
            queryUuid: z
                .string()
                .uuid()
                .describe(
                    'Query UUID to poll with get_source_query_status and fetch with get_query_result.',
                ),
        }),
    ),
    nextPollAfterMs: z
        .number()
        .int()
        .positive()
        .describe('Suggested delay before polling get_source_query_status.'),
});

export const mcpGetSourceQueryStatusStructuredOutputSchema = z.object({
    statuses: z.array(
        z.object({
            queryUuid: z.string().uuid(),
            status: z
                .enum(['running', 'done', 'error', 'cancelled', 'expired'])
                .describe(
                    '"running" covers the pending/queued/executing lifecycle states; "done" means rows are fetchable with get_query_result.',
                ),
            error: z
                .string()
                .nullable()
                .describe('Error message for failed queries.'),
        }),
    ),
});

export type McpRunSourceQueriesStructuredOutput = z.infer<
    typeof mcpRunSourceQueriesStructuredOutputSchema
>;
export type McpGetSourceQueryStatusStructuredOutput = z.infer<
    typeof mcpGetSourceQueryStatusStructuredOutputSchema
>;
