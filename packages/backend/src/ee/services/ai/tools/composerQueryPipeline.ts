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

export const renderSavedNodes = (
    queries: ComposerPipelineNode[],
    nodeStatuses: ComposerNodeStatus[],
    reusableNodes: ThreadComposerQueryNode[],
): string => {
    const saved = new Set(
        nodeStatuses.filter(isSaved).map(({ nodeId }) => nodeId),
    );
    const savedNodeIds = queries
        .filter((node) => saved.has(node.nodeId))
        .map((node) => node.nodeId);
    const notSaved = queries
        .filter((node) => !saved.has(node.nodeId))
        .map((node) => {
            const unsavedReads = Object.values(
                getSourceQueryResultReferences(node),
            ).filter((reference) => !saved.has(reference));
            const status = nodeStatuses.find(
                ({ nodeId }) => nodeId === node.nodeId,
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
            return `${node.nodeId} (${reason}${earlier})`;
        });
    return [
        savedNodeIds.length > 0
            ? `Saved from this call: ${savedNodeIds.join(', ')}.`
            : null,
        notSaved.length > 0 ? `Not saved: ${notSaved.join(', ')}.` : null,
    ]
        .filter(Boolean)
        .join(' ');
};

export type ComposerNodeSummary = {
    nodeId: string;
    title: string | null;
    sourceType: QuerySourceType;
    rowCount: number | null;
    limit: number;
    queryUuid?: string;
};

export const toComposerNodeSummaries = (
    queries: ComposerPipelineNode[],
    nodeStatuses: ComposerNodeStatus[],
): ComposerNodeSummary[] =>
    queries.map((node) => ({
        nodeId: node.nodeId,
        title: node.title ?? null,
        sourceType: node.sourceType,
        rowCount:
            nodeStatuses.find((status) => status.nodeId === node.nodeId)
                ?.rowCount ?? null,
        limit: getSourceQueryLimit(node),
    }));

export const hasReachedLimit = (node: ComposerNodeSummary) =>
    node.rowCount !== null && hasReachedSourceQueryLimit(node, node.rowCount);

/** One line per node (status, rows, limit) plus warnings for nodes reading a node that reached its limit. */
export const renderComposerNodeSummary = (
    queries: SourceQuery[],
    nodes: ComposerNodeSummary[],
    nodeStatuses: ComposerNodeStatus[],
    maxQueryLimit: number,
): string => {
    const reachedLimit = new Set(
        nodes.filter(hasReachedLimit).map((node) => node.nodeId),
    );
    const nodeLines = nodes.map((node) => {
        const status = nodeStatuses.find(
            (candidate) => candidate.nodeId === node.nodeId,
        );
        const label = [
            `- ${node.nodeId}`,
            node.title === null ? '' : `: "${node.title}"`,
            ` (${node.sourceType})`,
            node.queryUuid ? `, queryUuid ${node.queryUuid}` : '',
        ].join('');
        const outcome =
            node.rowCount === null
                ? `${status?.state ?? 'not read'}${status?.error ? `: ${status.error}` : ''}`
                : `${node.rowCount} rows`;
        const capped = reachedLimit.has(node.nodeId)
            ? ` Reached its limit of ${node.limit}, so more rows may exist (max ${maxQueryLimit}).`
            : '';
        return `${label}: ${outcome}, limit ${node.limit}.${capped}`;
    });
    const warnings = queries.flatMap((query) =>
        Object.values(getSourceQueryResultReferences(query))
            .filter((reference) => reachedLimit.has(reference))
            .map(
                (reference) =>
                    `Warning: "${query.nodeId}" reads "${reference}", which reached its limit, so "${query.nodeId}" may be computed on incomplete rows.`,
            ),
    );
    return [...nodeLines, ...warnings].join('\n');
};
