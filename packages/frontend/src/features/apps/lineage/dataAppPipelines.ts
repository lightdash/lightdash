import {
    friendlyName,
    getSourceQueryResultReferences,
    QuerySourceType,
    type AdditionalMetric,
    type AppSdkLineageHighlight,
    type AppSdkLineageSelection,
    type CustomDimension,
    type DataAppManifestQuery,
    type MetricQueryRequest,
    type SemanticLayerSourceQuery,
    type SortField,
    type SourceQuery,
    type TableCalculation,
} from '@lightdash/common';
import type { PipelineEvent, QueryEvent } from '../hooks/useAppSdkBridge';

/** One entry in the lineage view: a composer pipeline or a single app query. */
export type DataAppPipeline = {
    id: string;
    kind: 'composer' | 'query';
    queryId: string | null;
    title: string;
    description: string | null;
    status: PipelineEvent['status'];
    error: string | null;
    /** Terminal row count when known without polling (single queries). */
    rowCount: number | null;
    durationMs: number | null;
    timestamp: number;
    /** Display nodes: saved-chart sources become semantic layer nodes. */
    queries: SourceQuery[];
    terminalNodeId: string;
    nodeQueryUuids: Record<string, string>;
    savedChartNodeIds: string[];
    /** The query as declared in the build-time manifest; null when not in it. */
    declared: DataAppManifestQuery | null;
    /** False for a declared query the app has not run yet. */
    hasRun: boolean;
};

export const SINGLE_NODE_ID = 'query';

const EMPTY_QUERY_EVENT: QueryEvent = {
    id: '',
    timestamp: 0,
    label: null,
    queryId: null,
    description: null,
    chartUuid: null,
    exploreName: '',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    limit: 0,
    queryUuid: null,
    status: 'ready',
    rowCount: null,
    durationMs: null,
    error: null,
    rawMetricQuery: null,
};

/** A tracked metric/chart query as the semantic layer node it ran. */
const semanticNodeOf = (
    event: QueryEvent,
    node: { nodeId: string; title: string; description: string | null },
): SemanticLayerSourceQuery => {
    const raw = event.rawMetricQuery ?? {};
    return {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: node.nodeId,
        title: node.title,
        description: node.description ?? undefined,
        exploreName: event.exploreName,
        dimensions: event.dimensions,
        metrics: event.metrics,
        // Bridge payloads mirror the metric query API shape.
        filters: event.filters as MetricQueryRequest['filters'],
        sorts: event.sorts as SortField[],
        limit: event.limit > 0 ? event.limit : undefined,
        tableCalculations: (raw.tableCalculations ??
            event.tableCalculations) as TableCalculation[],
        additionalMetrics: (raw.additionalMetrics ??
            event.additionalMetrics) as AdditionalMetric[],
        customDimensions: raw.customDimensions as CustomDimension[] | undefined,
    };
};

const titleOfQuery = (event: QueryEvent): string =>
    event.label ??
    event.queryId ??
    (event.exploreName ? friendlyName(event.exploreName) : event.id);

const fromQueryEvent = (event: QueryEvent): DataAppPipeline => {
    const title = titleOfQuery(event);
    return {
        id: event.id,
        kind: 'query',
        queryId: event.queryId,
        title,
        description: event.description,
        status: event.status,
        error: event.error,
        rowCount: event.rowCount,
        durationMs: event.durationMs,
        timestamp: event.timestamp,
        queries: [
            semanticNodeOf(event, {
                nodeId: SINGLE_NODE_ID,
                title,
                description: event.description,
            }),
        ],
        terminalNodeId: SINGLE_NODE_ID,
        nodeQueryUuids: event.queryUuid
            ? { [SINGLE_NODE_ID]: event.queryUuid }
            : {},
        savedChartNodeIds: event.chartUuid ? [SINGLE_NODE_ID] : [],
        declared: null,
        hasRun: true,
    };
};

/** References to a saved chart's queryUuid point at its display node instead. */
const withSavedChartReferences = (
    query: SourceQuery,
    nodeIdByQueryUuid: ReadonlyMap<string, string>,
): SourceQuery => {
    if (
        query.sourceType !== QuerySourceType.DUCKDB &&
        query.sourceType !== QuerySourceType.PYTHON
    ) {
        return query;
    }
    const references = Object.fromEntries(
        Object.entries(getSourceQueryResultReferences(query)).map(
            ([alias, target]) => [
                alias,
                nodeIdByQueryUuid.get(target) ?? target,
            ],
        ),
    );
    return { ...query, references };
};

const fromPipelineEvent = (
    event: PipelineEvent,
    queriesByUuid: ReadonlyMap<string, QueryEvent>,
): DataAppPipeline => {
    const savedChartQueries = event.savedChartNodes.map((node) => {
        const display = {
            nodeId: node.nodeId,
            title: node.title ?? node.nodeId,
            description: node.description,
        };
        const ran = queriesByUuid.get(node.queryUuid);
        // Unknown explore: the notebook hides explore/SQL panels for it.
        return ran
            ? semanticNodeOf(ran, display)
            : semanticNodeOf(EMPTY_QUERY_EVENT, display);
    });
    const nodeIdByQueryUuid = new Map(
        event.savedChartNodes.map((node) => [node.queryUuid, node.nodeId]),
    );
    return {
        id: event.id,
        kind: 'composer',
        queryId: event.queryId,
        title: event.label ?? event.queryId,
        description: event.description,
        status: event.status,
        error: event.error,
        rowCount: null,
        durationMs: event.durationMs,
        timestamp: event.timestamp,
        queries: [
            ...savedChartQueries,
            ...event.queries.map((query) =>
                withSavedChartReferences(query, nodeIdByQueryUuid),
            ),
        ],
        terminalNodeId: event.terminalNodeId,
        nodeQueryUuids: event.nodeQueryUuids,
        savedChartNodeIds: event.savedChartNodes.map((node) => node.nodeId),
        declared: null,
        hasRun: true,
    };
};

/**
 * Every lineage entry, oldest first: composer pipelines plus each tracked
 * query as a one-node pipeline. Blank rows (failures before the request was
 * parsed) and saved charts run as a pipeline's source are skipped.
 */
export const toDataAppPipelines = (
    queries: QueryEvent[],
    pipelines: PipelineEvent[],
): DataAppPipeline[] => {
    const queriesByUuid = new Map(
        queries.flatMap((q) => (q.queryUuid ? [[q.queryUuid, q]] : [])),
    );
    const pipelineSourceUuids = new Set(
        pipelines.flatMap((p) => p.savedChartNodes.map((n) => n.queryUuid)),
    );
    const standaloneQueries = queries.filter(
        (q) =>
            q.exploreName !== '' &&
            (q.queryUuid === null || !pipelineSourceUuids.has(q.queryUuid)),
    );
    const all = [
        ...standaloneQueries.map(fromQueryEvent),
        ...pipelines.map((p) => fromPipelineEvent(p, queriesByUuid)),
    ].sort((a, b) => a.timestamp - b.timestamp);
    // A re-run of the same author id (re-render, filter change, reload) replaces
    // the earlier run: lineage shows what each block is built from, not history.
    const latestByQueryId = new Map(
        all.flatMap((p) => (p.queryId !== null ? [[p.queryId, p.id]] : [])),
    );
    return all.filter(
        (p) => p.queryId === null || latestByQueryId.get(p.queryId) === p.id,
    );
};

const terminalQueryUuidOf = (pipeline: DataAppPipeline): string | null =>
    pipeline.nodeQueryUuids[pipeline.terminalNodeId] ?? null;

/** What the app outlines for a pipeline, or for one of its nodes. */
export const highlightOf = (
    pipeline: DataAppPipeline,
    nodeId: string | null,
    { scroll }: { scroll: boolean },
): AppSdkLineageHighlight => ({
    queryUuid:
        nodeId === null
            ? terminalQueryUuidOf(pipeline)
            : (pipeline.nodeQueryUuids[nodeId] ?? null),
    queryId:
        nodeId === null || nodeId === pipeline.terminalNodeId
            ? pipeline.queryId
            : null,
    scroll,
});

/** Latest pipeline for an app selection: by author query id, then terminal, then any node. */
export const findPipelineForSelection = (
    pipelines: DataAppPipeline[],
    selection: AppSdkLineageSelection,
): DataAppPipeline | null => {
    const newestFirst = [...pipelines].reverse();
    const { queryId, queryUuid } = selection;
    return (
        (queryId !== null
            ? newestFirst.find((p) => p.queryId === queryId)
            : undefined) ??
        (queryUuid !== null
            ? (newestFirst.find((p) => terminalQueryUuidOf(p) === queryUuid) ??
              newestFirst.find((p) =>
                  Object.values(p.nodeQueryUuids).includes(queryUuid),
              ))
            : undefined) ??
        null
    );
};
