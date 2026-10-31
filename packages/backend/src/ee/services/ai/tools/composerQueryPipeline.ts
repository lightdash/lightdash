import {
    buildComposerArtifactPipeline,
    COMPOSER_QUERY_PREVIEW_ROW_LIMIT,
    getSourceQueryLimit,
    getSourceQueryResultReferences,
    hasReachedSourceQueryLimit,
    ParameterError,
    QueryHistoryStatus,
    QuerySourceType,
    toComposerNodeColumns,
    toolComposerQueryNodeToSourceQuery,
    type AnyType,
    type ComposerApiConnection,
    type ComposerNodeScopeName,
    type ComposerPipelineNode,
    type DimensionType,
    type Explore,
    type ParameterDefinitions,
    type ResultColumns,
    type SourceQuery,
    type SubmittedSourceQuery,
    type ThreadComposerQueryNode,
    type ToolComposerQueriesArgs,
    type ToolComposerQueriesStructuredContent,
    type ToolRunQueryAppliedParameters,
} from '@lightdash/common';
import { stringify } from 'csv-stringify/sync';
import type { ComposerNodeStatus } from '../types/aiAgentDependencies';
import { getAppliedParameters } from '../utils/appliedParameters';
import { validateQueryParameters } from '../utils/validators';
import { resolveComposerQueryNode } from './composerSemanticLayerFilters';
import { validateSelectOnly } from './runSql';

/**
 * Resolves which node the artifact should show: the explicit terminalNodeId
 * when given, otherwise the submission's unread node (the one node no other
 * submitted node reads). A submission with several unread nodes is rejected.
 */
export const resolveTerminalNodeId = (
    submitted: SubmittedSourceQuery[],
    terminalNodeId: string | null,
    pipeline: SourceQuery[],
): string => {
    const nodeIds = new Set(submitted.map((query) => query.nodeId));
    const read = new Set(
        submitted.flatMap((query) =>
            Object.values(getSourceQueryResultReferences(query)).filter(
                (reference) => nodeIds.has(reference),
            ),
        ),
    );
    const unread = submitted
        .map((query) => query.nodeId)
        .filter((nodeId) => !read.has(nodeId));
    if (unread.length > 1) {
        throw new ParameterError(
            `A pipeline returns one node's rows, and no node reads ${unread.join(
                ', ',
            )}. Combine them in one duckdb node (UNION ALL or JOIN), or submit them in separate calls; a later call can read any node from an earlier call by node id.`,
        );
    }
    if (terminalNodeId === null) {
        if (unread.length === 0) {
            throw new ParameterError(
                'Every node is read by another node, so the pipeline has a cycle. Remove the cycle.',
            );
        }
        return unread[0];
    }
    if (!pipeline.some((node) => node.nodeId === terminalNodeId)) {
        throw new ParameterError(
            `terminalNodeId "${terminalNodeId}" does not name a node in this pipeline`,
        );
    }
    return terminalNodeId;
};

export type ComposerAppliedParameters = ToolRunQueryAppliedParameters & {
    nodeId: string;
};

export type ComposerQueryPipeline = {
    queries: ComposerPipelineNode[];
    terminalNodeId: string;
    appliedParameters: ComposerAppliedParameters[];
};

/**
 * Turns submitted tool nodes into the pipeline to run: resolves filters,
 * copies reused nodes in and picks the terminal node. Returns a
 * model-actionable error for a pipeline the caller may not run; throws on
 * invalid nodes.
 */
export const buildComposerQueryPipeline = ({
    args: { queries: queryNodes, terminalNodeId },
    explores,
    projectParameterDefinitions,
    reusableNodes,
    scopeName = 'thread',
    enablePythonNodes,
    apiConnections,
    canRunSql,
    sqlDisabledMessage,
}: {
    args: Pick<ToolComposerQueriesArgs, 'queries' | 'terminalNodeId'>;
    explores: Explore[];
    projectParameterDefinitions: ParameterDefinitions;
    reusableNodes: ThreadComposerQueryNode[];
    scopeName?: ComposerNodeScopeName;
    enablePythonNodes: boolean;
    apiConnections: ComposerApiConnection[];
    canRunSql: boolean;
    sqlDisabledMessage: string;
}): { pipeline: ComposerQueryPipeline } | { error: string } => {
    const duplicates = queryNodes
        .map((node) => node.nodeId)
        .filter((nodeId, index, nodeIds) => nodeIds.indexOf(nodeId) !== index);
    if (duplicates.length > 0) {
        return {
            error: `Duplicate node id(s) in submission: ${duplicates.join(', ')}. Give every node a unique nodeId.`,
        };
    }

    const getExplore = (exploreName: string): Explore => {
        const explore = explores.find(({ name }) => name === exploreName);
        if (!explore) throw new Error(`Explore '${exploreName}' not found`);
        return explore;
    };

    queryNodes.forEach((node) => {
        if (
            node.sourceType !== QuerySourceType.SEMANTIC_LAYER ||
            node.parameters === null
        )
            return;
        validateQueryParameters(
            node.parameters,
            getExplore(node.exploreName),
            projectParameterDefinitions,
        );
    });

    // Filters resolve against the explore before anything runs.
    const submitted = queryNodes.map((node) =>
        toolComposerQueryNodeToSourceQuery(
            resolveComposerQueryNode(node, { getExplore }),
        ),
    );
    const queries = buildComposerArtifactPipeline({
        queries: submitted,
        threadNodes: reusableNodes,
        scopeName,
    });
    // Reused nodes run with the values they were defined with.
    const appliedParameters = queries.flatMap((node) => {
        if (node.sourceType !== QuerySourceType.SEMANTIC_LAYER) return [];
        const explore = explores.find(({ name }) => name === node.exploreName);
        const applied = explore
            ? getAppliedParameters(
                  explore,
                  projectParameterDefinitions,
                  node,
                  node.parameters ?? null,
              )
            : null;
        return applied ? [{ nodeId: node.nodeId, ...applied }] : [];
    });
    const resolvedTerminalNodeId = resolveTerminalNodeId(
        submitted,
        terminalNodeId,
        queries,
    );

    if (
        !enablePythonNodes &&
        queries.some((node) => node.sourceType === QuerySourceType.PYTHON)
    ) {
        return {
            error: 'This pipeline contains "python" nodes but python queries are not enabled. Rebuild the pipeline with duckdb nodes instead.',
        };
    }

    if (
        apiConnections.length === 0 &&
        queries.some((node) => node.sourceType === QuerySourceType.API)
    ) {
        return {
            error: 'This pipeline contains "api" nodes but api queries are not enabled. Rebuild the pipeline without them.',
        };
    }

    const unknownConnectionNode = queries.find(
        (node) =>
            node.sourceType === QuerySourceType.API &&
            !apiConnections.some(
                ({ connectionUuid }) => connectionUuid === node.connectionUuid,
            ),
    );
    if (unknownConnectionNode) {
        return {
            error: `Node "${unknownConnectionNode.nodeId}" names a connection that is not available. Use one of the connectionUuid values listed in the tool description.`,
        };
    }

    const sqlNodes = queries.filter(
        (node) => node.sourceType === QuerySourceType.SQL,
    );
    if (sqlNodes.length > 0 && !canRunSql) {
        return { error: sqlDisabledMessage };
    }
    sqlNodes.forEach((node) => validateSelectOnly(node.sql));

    return {
        pipeline: {
            queries,
            terminalNodeId: resolvedTerminalNodeId,
            appliedParameters,
        },
    };
};

export type ComposerPreview = {
    columns: { reference: string; type: DimensionType }[];
    rows: Record<string, AnyType>[];
    csv: string;
    truncated: boolean;
};

export const buildComposerPreview = (terminal: {
    columns: ResultColumns;
    rows: Record<string, AnyType>[];
    rowCount: number;
}): ComposerPreview => {
    const columns = Object.values(terminal.columns).map(
        ({ reference, type }) => ({ reference, type }),
    );
    const references = columns.map((column) => column.reference);
    const rows = terminal.rows
        .slice(0, COMPOSER_QUERY_PREVIEW_ROW_LIMIT)
        .map((row) =>
            Object.fromEntries(references.map((col) => [col, row[col]])),
        );
    return {
        columns,
        rows,
        csv: stringify(rows, { header: true, columns: references }),
        truncated: terminal.rowCount > COMPOSER_QUERY_PREVIEW_ROW_LIMIT,
    };
};

export const toNodeColumns = (nodeStatuses: ComposerNodeStatus[]) =>
    Object.fromEntries(
        nodeStatuses.flatMap(({ nodeId, columns }) =>
            columns ? [[nodeId, toComposerNodeColumns(columns)]] : [],
        ),
    );

/** Only ready nodes are saved; other node ids stay free to resubmit corrected. */
export const isSaved = ({ state }: ComposerNodeStatus) =>
    state === QueryHistoryStatus.READY;

type ComposerNodeSummary =
    ToolComposerQueriesStructuredContent['nodes'][number];

const getReads = (node: SourceQuery) =>
    Object.values(getSourceQueryResultReferences(node));

export const toNodeSummary = (
    node: ComposerPipelineNode,
    status: ComposerNodeStatus | undefined,
    showColumns: boolean,
): ComposerNodeSummary => ({
    nodeId: node.nodeId,
    title: node.title ?? null,
    sourceType: node.sourceType,
    rowCount: status?.rowCount ?? null,
    limit: getSourceQueryLimit(node),
    columns:
        showColumns && status?.columns
            ? toComposerNodeColumns(status.columns)
            : null,
    sample: status?.sample ?? null,
});

export const hasReachedLimit = (node: ComposerNodeSummary) =>
    node.rowCount !== null && hasReachedSourceQueryLimit(node, node.rowCount);

const renderNodeDetails = ({
    columns,
    sample,
    rowCount,
}: ComposerNodeSummary): string[] => {
    const columnLines =
        columns === null
            ? []
            : [
                  `Columns: ${columns
                      .map(({ reference, type }) => `${reference} (${type})`)
                      .join(', ')}`,
              ];
    const sampleLines =
        sample === null || sample.length === 0
            ? []
            : [
                  `Sample, ${sample.length} of ${rowCount ?? sample.length} rows:`,
                  ...stringify(sample, {
                      header: true,
                      ...(columns === null
                          ? {}
                          : {
                                columns: columns.map(
                                    ({ reference }) => reference,
                                ),
                            }),
                  })
                      .trimEnd()
                      .split('\n'),
              ];
    return [...columnLines, ...sampleLines].map((line) => `  ${line}`);
};

/** Every node of the pipeline in the given order, with its node columns and node sample under it when it has them. */
export const renderComposerNodeListing = ({
    queries,
    nodes,
    nodeStatuses,
    reusableNodes,
    submittedNodeIds,
    maxQueryLimit,
    queryUuids = new Map(),
}: {
    queries: ComposerPipelineNode[];
    nodes: ComposerNodeSummary[];
    nodeStatuses: ComposerNodeStatus[];
    reusableNodes: ThreadComposerQueryNode[];
    submittedNodeIds: Set<string>;
    maxQueryLimit: number;
    /** Shown in each node's label so the node can be read by its query uuid. */
    queryUuids?: ReadonlyMap<string, string>;
}): string => {
    const saved = new Set(
        nodeStatuses.filter(isSaved).map(({ nodeId }) => nodeId),
    );
    const reachedLimit = new Set(
        nodes.filter(hasReachedLimit).map((node) => node.nodeId),
    );
    const getOutcome = (node: ComposerNodeSummary): string => {
        if (node.rowCount !== null) {
            const capped = reachedLimit.has(node.nodeId)
                ? ` Reached its limit of ${node.limit}, so more rows may exist (max ${maxQueryLimit}).`
                : '';
            const reused = submittedNodeIds.has(node.nodeId)
                ? ''
                : ' Reused from an earlier call.';
            return `${node.rowCount} rows, limit ${node.limit}.${capped}${reused}`;
        }
        const query = queries.find(({ nodeId }) => nodeId === node.nodeId);
        const status = nodeStatuses.find(
            ({ nodeId }) => nodeId === node.nodeId,
        );
        const unsavedReads = (query ? getReads(query) : []).filter(
            (reference) => !saved.has(reference),
        );
        let reason: string;
        if (unsavedReads.length > 0) {
            reason = `not run: reads ${unsavedReads.join(', ')}`;
        } else if (status?.error) {
            reason = `failed: ${status.error}`;
        } else {
            reason = `not finished${status ? `: ${status.state}` : ''}`;
        }
        const earlier = reusableNodes.some(
            ({ nodeId }) => nodeId === node.nodeId,
        )
            ? '; still saved from an earlier call'
            : '';
        return `${reason}${earlier}`;
    };
    const nodeLines = nodes.map((node) => {
        const queryUuid = queryUuids.get(node.nodeId);
        const label = [
            `- ${node.nodeId}`,
            node.title === null ? '' : `: "${node.title}"`,
            ` (${node.sourceType})`,
            queryUuid ? `, queryUuid ${queryUuid}` : '',
        ].join('');
        return [
            `${label}: ${getOutcome(node)}`,
            ...renderNodeDetails(node),
        ].join('\n');
    });
    const warnings = queries.flatMap((query) =>
        getReads(query)
            .filter((reference) => reachedLimit.has(reference))
            .map(
                (reference) =>
                    `Warning: "${query.nodeId}" reads "${reference}", which reached its limit, so "${query.nodeId}" may be computed on incomplete rows.`,
            ),
    );
    return [...nodeLines, ...warnings].join('\n');
};

/** A failed run's nodes: each failed node, then the nodes it reads, then the rest. */
export const getFailedRunNodes = (
    queries: ComposerPipelineNode[],
    nodeStatuses: ComposerNodeStatus[],
    submittedNodeIds: Set<string>,
): ComposerNodeSummary[] => {
    const saved = new Set(
        nodeStatuses.filter(isSaved).map(({ nodeId }) => nodeId),
    );
    const getStatus = (nodeId: string) =>
        nodeStatuses.find((status) => status.nodeId === nodeId);
    const failed = queries.filter(
        (node) =>
            !saved.has(node.nodeId) &&
            !!getStatus(node.nodeId)?.error &&
            getReads(node).every((reference) => saved.has(reference)),
    );
    const readByFailed = new Set(failed.flatMap(getReads));
    const order = [
        ...new Set([
            ...failed.flatMap((node) => [node.nodeId, ...getReads(node)]),
            ...queries.map(({ nodeId }) => nodeId),
        ]),
    ];
    return order.flatMap((nodeId) => {
        const node = queries.find((query) => query.nodeId === nodeId);
        return node
            ? [
                  toNodeSummary(
                      node,
                      getStatus(nodeId),
                      submittedNodeIds.has(nodeId) || readByFailed.has(nodeId),
                  ),
              ]
            : [];
    });
};
