import {
    buildResultColumnItems,
    getResultColumnFieldId,
    type ResultColumnItems,
} from '../utils/resultColumnItems';
import { ExploreType, type Explore } from './explore';
import { FieldType, friendlyName, isField } from './field';
import { type PivotConfiguration } from './pivot';
import {
    getSourceQueryResultReferences,
    QuerySourceType,
    type DuckdbSourceQuery,
    type QueryNodeId,
    type SourceQuery,
} from './querySources';
import { type ResultColumns } from './results';

/**
 * A saved chart whose query is a composer pipeline instead of a metric
 * query: the nodes, the terminal node whose result the chart draws, and the
 * terminal result's columns as they were when the chart was saved. The
 * columns make the chart's fields known before the pipeline runs, so the
 * chart config, the explorer-style field metadata and the dashboard filter
 * catalogue need no run. Field ids are `<terminalNodeId>_<column>`.
 */
export type SavedPipelineDefinition = {
    /** Self-contained: every node has a node id and reads only nodes of this pipeline. */
    queries: SourceQuery[];
    terminalNodeId: QueryNodeId;
    columns: ResultColumns;
};

export const SAVED_PIPELINE_SCHEMA_VERSION = 1;

/** The node a saved pipeline chart's run appends: the terminal result as the chart's fields, pivoted when the chart pivots. */
export const PIPELINE_VIZ_NODE_ID: QueryNodeId = 'viz';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A stored pipeline definition, or null when its shape is not one: nodes
 * with ids that only read nodes of the pipeline, a terminal node among them,
 * and the terminal columns. Intent only, never SQL.
 */
export const parseSavedPipelineDefinition = (
    value: unknown,
): SavedPipelineDefinition | null => {
    if (!isRecord(value)) return null;
    const { queries, terminalNodeId, columns } = value;
    if (!Array.isArray(queries) || queries.length === 0) return null;
    if (typeof terminalNodeId !== 'string' || terminalNodeId === '')
        return null;
    if (!isRecord(columns)) return null;
    const nodeIds = new Set<string>();
    for (const node of queries) {
        if (!isRecord(node)) return null;
        if (typeof node.nodeId !== 'string' || node.nodeId === '') return null;
        if (
            typeof node.sourceType !== 'string' ||
            !Object.values(QuerySourceType).includes(
                node.sourceType as QuerySourceType,
            )
        )
            return null;
        if (nodeIds.has(node.nodeId)) return null;
        // The run appends its own node under this id
        if (node.nodeId === PIPELINE_VIZ_NODE_ID) return null;
        nodeIds.add(node.nodeId);
    }
    if (!nodeIds.has(terminalNodeId)) return null;
    const typedQueries = queries as SourceQuery[];
    for (const node of typedQueries) {
        const reads = Object.values(getSourceQueryResultReferences(node));
        if (reads.some((reference) => !nodeIds.has(reference))) return null;
    }
    for (const [reference, column] of Object.entries(columns)) {
        if (!isRecord(column)) return null;
        if (column.reference !== reference) return null;
        if (typeof column.type !== 'string') return null;
    }
    return {
        queries: typedQueries,
        terminalNodeId,
        columns: columns as ResultColumns,
    };
};

/** The pipeline's terminal node, by its id. */
export const getPipelineTerminalNode = (
    pipeline: Pick<SavedPipelineDefinition, 'queries' | 'terminalNodeId'>,
): SourceQuery | undefined =>
    pipeline.queries.find((node) => node.nodeId === pipeline.terminalNodeId);

/** The items of a pipeline chart: the terminal columns as dimensions and metrics of a table named after the terminal node. */
export const buildSavedPipelineItems = (
    pipeline: SavedPipelineDefinition,
): ResultColumnItems =>
    buildResultColumnItems(pipeline.columns, {
        table: pipeline.terminalNodeId,
        tableLabel:
            getPipelineTerminalNode(pipeline)?.title ??
            friendlyName(pipeline.terminalNodeId),
    });

/**
 * An explore for a pipeline chart, so every consumer that reads a saved
 * chart's explore (dashboard tiles, filters, labels) works without one in
 * the project. Virtual: one table, no SQL, nothing to compile.
 */
export const buildSavedPipelineExplore = (
    pipeline: SavedPipelineDefinition,
    items: ResultColumnItems = buildSavedPipelineItems(pipeline),
): Explore => {
    const tableName = pipeline.terminalNodeId;
    const label =
        getPipelineTerminalNode(pipeline)?.title ?? friendlyName(tableName);
    const fields = Object.values(items.itemsMap).filter(isField);
    const dimensions = Object.fromEntries(
        fields
            .filter((item) => item.fieldType === FieldType.DIMENSION)
            .map((item) => [
                item.name,
                { ...item, compiledSql: '', tablesReferences: [tableName] },
            ]),
    );
    const metrics = Object.fromEntries(
        fields
            .filter((item) => item.fieldType === FieldType.METRIC)
            .map((item) => [
                item.name,
                { ...item, compiledSql: '', tablesReferences: [tableName] },
            ]),
    );
    return {
        name: tableName,
        label,
        tags: [],
        baseTable: tableName,
        joinedTables: [],
        tables: {
            [tableName]: {
                name: tableName,
                label,
                database: '',
                schema: '',
                sqlTable: '',
                dimensions,
                metrics,
                lineageGraph: {},
            },
        },
        targetDatabase: 'duckdb' as Explore['targetDatabase'],
        type: ExploreType.VIRTUAL,
    } as Explore;
};

const quoteIdentifier = (identifier: string) =>
    `"${identifier.replace(/"/g, '""')}"`;

/**
 * The node a run appends after the terminal node: every terminal column
 * selected under its field id, so the result the chart reads is keyed the
 * way every saved chart result is. Sort, limit and pivot are applied by the
 * run's composer over this statement, the way a merge's are.
 */
export const buildSavedPipelineVizNode = ({
    pipeline,
    pivotConfiguration,
}: {
    pipeline: SavedPipelineDefinition;
    pivotConfiguration?: PivotConfiguration;
}): DuckdbSourceQuery => {
    const selectList = Object.values(pipeline.columns)
        .map(
            (column) =>
                `${quoteIdentifier(column.reference)} AS ${quoteIdentifier(
                    getResultColumnFieldId(
                        pipeline.terminalNodeId,
                        column.reference,
                    ),
                )}`,
        )
        .join(', ');
    return {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: PIPELINE_VIZ_NODE_ID,
        title: 'Chart',
        sql: `SELECT ${selectList} FROM ${quoteIdentifier(
            pipeline.terminalNodeId,
        )}`,
        references: [pipeline.terminalNodeId],
        ...(pivotConfiguration ? { pivotConfiguration } : {}),
    };
};

/** The field ids of a pipeline chart's result, in the terminal result's column order. */
export const getSavedPipelineFieldIds = (
    pipeline: SavedPipelineDefinition,
): string[] =>
    Object.values(pipeline.columns).map((column) =>
        getResultColumnFieldId(pipeline.terminalNodeId, column.reference),
    );

/** Whether a pipeline has a node that runs warehouse SQL, which bypasses user attributes. */
export const pipelineHasWarehouseSql = (
    pipeline: Pick<SavedPipelineDefinition, 'queries'>,
): boolean =>
    pipeline.queries.some((node) => node.sourceType === QuerySourceType.SQL);
