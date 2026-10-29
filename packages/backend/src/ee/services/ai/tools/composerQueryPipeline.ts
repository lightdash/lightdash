import {
    buildComposerArtifactPipeline,
    COMPOSER_QUERY_PREVIEW_ROW_LIMIT,
    getSourceQueryResultReferences,
    QueryHistoryStatus,
    QuerySourceType,
    toComposerNodeColumns,
    toolComposerQueryNodeToSourceQuery,
    type AnyType,
    type ComposerApiConnection,
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
 * when given, otherwise the unique sink (the one node no other node
 * references in-submission). Throws a model-actionable error otherwise.
 */
export const resolveTerminalNodeId = (
    submitted: SubmittedSourceQuery[],
    terminalNodeId: string | null,
    pipeline: SourceQuery[],
): string => {
    const nodeIds = new Set(submitted.map((query) => query.nodeId));
    if (terminalNodeId !== null) {
        if (!pipeline.some((node) => node.nodeId === terminalNodeId)) {
            throw new Error(
                `terminalNodeId "${terminalNodeId}" does not name a node in this pipeline`,
            );
        }
        return terminalNodeId;
    }

    const referenced = new Set<string>();
    submitted.forEach((query) => {
        Object.values(getSourceQueryResultReferences(query))
            .filter((reference) => nodeIds.has(reference))
            .forEach((reference) => referenced.add(reference));
    });

    const sinks = submitted
        .map((query) => query.nodeId)
        .filter((nodeId) => !referenced.has(nodeId));
    if (sinks.length !== 1) {
        throw new Error(
            `The pipeline has ${sinks.length} sinks (${sinks.join(
                ', ',
            )}); pass terminalNodeId to pick which node's result this tool returns`,
        );
    }
    return sinks[0];
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
    enablePythonNodes,
    apiConnections,
    canRunSql,
    sqlDisabledMessage,
}: {
    args: Pick<ToolComposerQueriesArgs, 'queries' | 'terminalNodeId'>;
    explores: Explore[];
    projectParameterDefinitions: ParameterDefinitions;
    reusableNodes: ThreadComposerQueryNode[];
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
