import {
    COMPOSER_QUERY_PREVIEW_ROW_LIMIT,
    createToolComposerQueriesArgsSchema,
    getSourceQueryLimit,
    getSourceQueryResultReferences,
    getSqlApprovalSql,
    getToolComposerQueriesDescription,
    hasReachedSourceQueryLimit,
    QuerySourceType,
    queryToolDefinition,
    toComposerNodeColumns,
    WarehouseQueryError,
    type ComposerApiConnection,
    type ComposerPipelineNode,
    type ParameterDefinitions,
    type SemanticLayerSourceQuery,
    type SourceQuery,
    type ThreadComposerQueryNode,
    type ToolComposerQueriesStructuredContent,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { type AiDecisionClient } from '../decisions/AiDecisionClient';
import { getEmptyFilterHints } from '../decisions/queryChecks';
import {
    preferFilterValueHints,
    type QueryReviewer,
} from '../decisions/queryReview';
import type {
    ComposerNodeStatus,
    GetPromptFn,
    IsThreadSqlAutoApprovedFn,
    ListSqlApprovalDecisionsFn,
    ListThreadComposerQueryNodesFn,
    RecordSqlApprovalFn,
    RegisterThreadComposerQueryNodesFn,
    RunComposerQueriesFn,
    SearchFieldValuesFn,
    StoreToolResultsFn,
    UpdateProgressFn,
    UpdateSlackMessageFn,
    WaitForSqlApprovalFn,
} from '../types/aiAgentDependencies';
import { type AgentContext } from '../utils/AgentContext';
import { renderAppliedParameters } from '../utils/appliedParameters';
import { serializeData } from '../utils/serializeData';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import {
    buildComposerPreview,
    buildComposerQueryPipeline,
    isSaved,
    toNodeColumns,
} from './composerQueryPipeline';
import { getSqlApprovalSteps } from './slackSqlAggregate';
import { createSqlApprovalGate, type SqlApprovalCopy } from './sqlApprovalGate';
import {
    COMPOSER_SQL_REJECTED_RESULT,
    getSqlApprovalHeading,
    SqlNotApprovedError,
    type TrackSqlApprovalTimeoutFn,
} from './sqlApprovals';

export type FilterValueHintDependencies = {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    searchFieldValues: SearchFieldValuesFn;
};

type Dependencies = {
    agentContext: AgentContext;
    reviewQuery?: QueryReviewer;
    filterValueHints: FilterValueHintDependencies | null;
    updateProgress: UpdateProgressFn;
    runComposerQueries: RunComposerQueriesFn;
    getPrompt: GetPromptFn;
    updateSlackMessage: UpdateSlackMessageFn;
    siteUrl: string;
    waitForSqlApproval: WaitForSqlApprovalFn;
    recordSqlApproval: RecordSqlApprovalFn;
    isThreadSqlAutoApproved: IsThreadSqlAutoApprovedFn;
    listSqlApprovalDecisions: ListSqlApprovalDecisionsFn;
    trackSqlApprovalTimeout: TrackSqlApprovalTimeoutFn;
    storeToolResults: StoreToolResultsFn;
    listThreadComposerQueryNodes: ListThreadComposerQueryNodesFn;
    registerThreadComposerQueryNodes: RegisterThreadComposerQueryNodesFn;
    maxQueryLimit: number;
    enableDataAccess: boolean;
    canRunSql: boolean;
    enablePythonNodes: boolean;
    // Project API connections api nodes may query; empty disables api nodes.
    apiConnections: ComposerApiConnection[];
    autoApproveSql?: boolean;
    autoApproveSqlUserUuid?: string | null;
    useSlackStreamCard?: boolean;
    // Model-level definitions come from the explore.
    projectParameterDefinitions: ParameterDefinitions;
};

const toolDefinition = queryToolDefinition.for('agent');

const COMPOSER_SQL_APPROVAL_COPY: SqlApprovalCopy = {
    slackText: 'SQL execution',
    pendingProgress: 'Awaiting approval to run SQL...',
    // The tool reports its own progress once approved.
    approvedProgress: null,
    rejectedResult: COMPOSER_SQL_REJECTED_RESULT,
    timeoutResult:
        'SQL approval timed out after 5 minutes with no response. The user may have stepped away — acknowledge politely and wait for them to re-ask.',
    previousTimeoutResult:
        'A previous SQL approval timed out in this response. Do not call query again in this response; tell the user the SQL was not approved and ask them to retry when ready.',
};

type ComposerQueriesOutput =
    | ExecuteStructuredToolResult<
          ToolComposerQueriesStructuredContent,
          ToolComposerQueriesSuccessMetadata
      >
    | ExecuteToolErrorResult<{ status: 'error' | 'rejected' | 'timeout' }>;

const failure = (
    result: string,
    status: 'error' | 'rejected' | 'timeout',
): ComposerQueriesOutput => ({
    result,
    metadata: { status },
    structuredContent: { error: result },
});

/** Semantic layer nodes the terminal node reads from, itself included. */
const getSemanticLayerAncestors = (
    pipeline: SourceQuery[],
    terminalNodeId: string,
): SemanticLayerSourceQuery[] => {
    const byId = new Map(pipeline.map((node) => [node.nodeId, node]));
    const visited = new Set<string>();
    const visit = (nodeId: string): SemanticLayerSourceQuery[] => {
        const node = byId.get(nodeId);
        if (!node || visited.has(nodeId)) return [];
        visited.add(nodeId);
        return node.sourceType === QuerySourceType.SEMANTIC_LAYER
            ? [node]
            : Object.values(getSourceQueryResultReferences(node)).flatMap(
                  visit,
              );
    };
    return visit(terminalNodeId);
};

const getComposerEmptyFilterHints = async (
    { decisions, searchFieldValues }: FilterValueHintDependencies,
    nodes: SemanticLayerSourceQuery[],
): Promise<string> => {
    const hints = await Promise.all(
        nodes.map((node) =>
            getEmptyFilterHints({
                decisions,
                query: {
                    exploreName: node.exploreName,
                    filters: node.filters ?? {},
                },
                searchFieldValues,
            }),
        ),
    );
    return hints.filter(Boolean).join(' ');
};

type ComposerNodeSummary =
    ToolComposerQueriesStructuredContent['nodes'][number];

const getReads = (node: SourceQuery) =>
    Object.values(getSourceQueryResultReferences(node));

const toNodeSummary = (
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
const renderComposerNodeListing = ({
    queries,
    nodes,
    nodeStatuses,
    threadNodes,
    submittedNodeIds,
    maxQueryLimit,
}: {
    queries: ComposerPipelineNode[];
    nodes: ComposerNodeSummary[];
    nodeStatuses: ComposerNodeStatus[];
    threadNodes: ThreadComposerQueryNode[];
    submittedNodeIds: Set<string>;
    maxQueryLimit: number;
}): string => {
    const saved = new Set(
        nodeStatuses.filter(isSaved).map(({ nodeId }) => nodeId),
    );
    const reachedLimit = new Set(
        nodes
            .filter(
                (node) =>
                    node.rowCount !== null &&
                    hasReachedSourceQueryLimit(node, node.rowCount),
            )
            .map((node) => node.nodeId),
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
        const earlier = threadNodes.some(({ nodeId }) => nodeId === node.nodeId)
            ? '; still saved from an earlier call'
            : '';
        return `${reason}${earlier}`;
    };
    const nodeLines = nodes.map((node) => {
        const label =
            node.title === null
                ? `- ${node.nodeId} (${node.sourceType})`
                : `- ${node.nodeId}: "${node.title}" (${node.sourceType})`;
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
const getFailedRunNodes = (
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

export const getRunComposerQueries = ({
    agentContext,
    reviewQuery,
    filterValueHints,
    updateProgress,
    runComposerQueries,
    getPrompt,
    updateSlackMessage,
    siteUrl,
    waitForSqlApproval,
    recordSqlApproval,
    isThreadSqlAutoApproved,
    listSqlApprovalDecisions,
    trackSqlApprovalTimeout,
    storeToolResults,
    listThreadComposerQueryNodes,
    registerThreadComposerQueryNodes,
    maxQueryLimit,
    enableDataAccess,
    canRunSql,
    enablePythonNodes,
    apiConnections,
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
    useSlackStreamCard = false,
    projectParameterDefinitions,
}: Dependencies) => {
    const approvalGate = createSqlApprovalGate(
        {
            getPrompt,
            updateProgress,
            updateSlackMessage,
            siteUrl,
            waitForSqlApproval,
            recordSqlApproval,
            isThreadSqlAutoApproved,
            listSqlApprovalDecisions,
            trackSqlApprovalTimeout,
            storeToolResults,
            autoApproveSql,
            autoApproveSqlUserUuid,
            useSlackStreamCard,
        },
        'query',
        COMPOSER_SQL_APPROVAL_COPY,
    );

    const enableApiNodes = apiConnections.length > 0;
    const inputSchema = createToolComposerQueriesArgsSchema({
        maxLimit: maxQueryLimit,
        enablePythonNodes,
        enableApiNodes,
    });

    return tool({
        description: getToolComposerQueriesDescription({
            enablePythonNodes,
            apiConnections,
        }),
        inputSchema,
        outputSchema: toolDefinition.outputSchema,
        toModelOutput: toolDefinition.toModelOutput,
        // Only sql nodes submitted in this call gate; sql reused from an
        // earlier call was approved then.
        needsApproval: (args, { toolCallId }) =>
            approvalGate.needsNativeApproval({
                toolCallId,
                sql: getSqlApprovalSql(args),
            }),
        execute: async (
            args,
            { toolCallId },
        ): Promise<ComposerQueriesOutput> => {
            const {
                title,
                description,
                queries: queryNodes,
                terminalNodeId,
            } = args;
            const approvalSql = getSqlApprovalSql(args);
            // Every return routes through persistIfResumed so a resumed call
            // always stores a result.
            const { approveSql, renderState, persistIfResumed } =
                await approvalGate.forToolCall(toolCallId, {
                    sql: approvalSql,
                });
            try {
                const prompt = await getPrompt();
                const threadNodes = await listThreadComposerQueryNodes(
                    prompt.threadUuid,
                );
                const built = buildComposerQueryPipeline({
                    args: { queries: queryNodes, terminalNodeId },
                    explores: agentContext.getAvailableExplores(),
                    projectParameterDefinitions,
                    reusableNodes: threadNodes,
                    enablePythonNodes,
                    apiConnections,
                    canRunSql,
                    sqlDisabledMessage:
                        'This pipeline contains "sql" nodes but SQL execution is not enabled for this agent. Rebuild the pipeline without sql nodes (semanticLayer and duckdb nodes are still available).',
                });
                if ('error' in built) {
                    return await persistIfResumed(
                        failure(built.error, 'error'),
                    );
                }
                const {
                    queries,
                    terminalNodeId: resolvedTerminalNodeId,
                    appliedParameters,
                } = built.pipeline;
                const submittedNodeIds = new Set(
                    queryNodes.map(({ nodeId }) => nodeId),
                );

                if (approvalSql !== null) {
                    try {
                        await approveSql({
                            sql: approvalSql,
                            heading: getSqlApprovalHeading('query'),
                            steps: getSqlApprovalSteps('query', args),
                        });
                    } catch (e) {
                        if (e instanceof SqlNotApprovedError) {
                            return await persistIfResumed(
                                failure(e.message, e.outcome),
                            );
                        }
                        throw e;
                    }
                    await renderState({ kind: 'running', sql: approvalSql });
                }

                await updateProgress('Running composer queries...');

                const [run, review] = await Promise.all([
                    runComposerQueries({
                        queries,
                        terminalNodeId: resolvedTerminalNodeId,
                        sampleNodeIds: enableDataAccess
                            ? [...submittedNodeIds].filter(
                                  (nodeId) => nodeId !== resolvedTerminalNodeId,
                              )
                            : [],
                        // Per-node lifecycle → transient step-progress events the
                        // web stream renders as live statuses on the pipeline.
                        // progressId carries `${toolCallId}:${nodeId}` so the
                        // client can key events to the right call and node.
                        // Fire-and-forget: status delivery must never block or
                        // fail the query.
                        onNodeStatus: ({ nodeId, status, errorMessage }) => {
                            let message: string;
                            let progressStatus:
                                | 'in_progress'
                                | 'complete'
                                | 'error';
                            if (status === 'running') {
                                message = `Running query "${nodeId}"...`;
                                progressStatus = 'in_progress';
                            } else if (status === 'success') {
                                message = `Query "${nodeId}" complete`;
                                progressStatus = 'complete';
                            } else {
                                message = `Query "${nodeId}" failed${errorMessage ? `: ${errorMessage}` : ''}`;
                                progressStatus = 'error';
                            }
                            void updateProgress(
                                message,
                                'query',
                                `${toolCallId}:${nodeId}`,
                                progressStatus,
                            ).catch(() => {});
                        },
                    }),
                    enableDataAccess
                        ? (reviewQuery?.({
                              kind: 'composer',
                              queries,
                              terminalNodeId: resolvedTerminalNodeId,
                          }) ?? '')
                        : '',
                ]);

                // Only ready nodes are saved; other node ids stay free to resubmit corrected.
                const saved = run.nodeStatuses.filter(isSaved);
                const savedNodes = queries.filter((node) =>
                    saved.some(({ nodeId }) => nodeId === node.nodeId),
                );
                if (run.status === 'failure') {
                    await registerThreadComposerQueryNodes({
                        threadUuid: prompt.threadUuid,
                        nodes: savedNodes,
                        nodeColumns: toNodeColumns(saved),
                    });
                    const nodeListing = renderComposerNodeListing({
                        queries,
                        nodes: getFailedRunNodes(
                            queries,
                            run.nodeStatuses,
                            submittedNodeIds,
                        ),
                        nodeStatuses: run.nodeStatuses,
                        threadNodes,
                        submittedNodeIds,
                        maxQueryLimit,
                    });
                    throw new WarehouseQueryError(
                        `${run.error}\nNodes in this pipeline, failed nodes first. A later call can read any node with rows by node id:\n${nodeListing}`,
                    );
                }
                const { terminal, nodeStatuses } = run;

                if (approvalSql !== null) {
                    await renderState({
                        kind: 'success',
                        sql: approvalSql,
                        rowCount: terminal.rowCount,
                        inlineCsv: '',
                        truncated: false,
                    });
                }

                const artifactTitle = title ?? 'Composer query results';
                const metadata: ToolComposerQueriesSuccessMetadata = {
                    status: 'success',
                    queryUuid: terminal.queryUuid,
                    terminalNodeId: resolvedTerminalNodeId,
                    title: artifactTitle,
                    description: description ?? null,
                };

                const nodes = queries.map((node) => {
                    const status = nodeStatuses.find(
                        ({ nodeId }) => nodeId === node.nodeId,
                    );
                    // The terminal node's columns and rows are shown in full below.
                    return node.nodeId === resolvedTerminalNodeId
                        ? toNodeSummary(
                              node,
                              status && { ...status, sample: null },
                              false,
                          )
                        : toNodeSummary(
                              node,
                              status,
                              submittedNodeIds.has(node.nodeId),
                          );
                });
                const nodeSummary = renderComposerNodeListing({
                    queries,
                    nodes,
                    nodeStatuses,
                    threadNodes,
                    submittedNodeIds,
                    maxQueryLimit,
                });
                const preview = buildComposerPreview(terminal);
                const { columns } = preview;
                const columnSummary = columns
                    .map((column) => `${column.reference} (${column.type})`)
                    .join(', ');
                const isEmpty = enableDataAccess && terminal.rowCount === 0;
                const [diagnosis, valueHints] = await Promise.all([
                    isEmpty && reviewQuery
                        ? reviewQuery(
                              {
                                  kind: 'composer',
                                  queries,
                                  terminalNodeId: resolvedTerminalNodeId,
                              },
                              { emptyResult: true, review },
                          )
                        : null,
                    isEmpty && filterValueHints
                        ? getComposerEmptyFilterHints(
                              filterValueHints,
                              getSemanticLayerAncestors(
                                  queries,
                                  resolvedTerminalNodeId,
                              ),
                          )
                        : '',
                ]);
                const emptyReview =
                    diagnosis === null && !valueHints
                        ? null
                        : preferFilterValueHints({
                              diagnosis: diagnosis ?? '',
                              valueHints,
                              review,
                          });
                const resultSummary = [
                    `Composer query complete. Terminal node "${resolvedTerminalNodeId}" returned ${terminal.rowCount} rows.`,
                    `Nodes in this pipeline:\n${nodeSummary}`,
                    `Terminal columns: ${columnSummary}.`,
                    ...appliedParameters.map(
                        ({ nodeId, ...applied }) =>
                            `Node "${nodeId}":${renderAppliedParameters(applied)}`,
                    ),
                    `Not visualized yet. To present it to the user, call visualize with nodeId "${resolvedTerminalNodeId}".`,
                    ...(review && terminal.rowCount !== 0 ? [review] : []),
                    ...(emptyReview !== null ? [emptyReview] : []),
                ].join('\n');
                const summary = {
                    terminalNodeId: resolvedTerminalNodeId,
                    rowCount: terminal.rowCount,
                    nodes,
                    columns,
                    parameters: appliedParameters,
                    review:
                        terminal.rowCount === 0 ? emptyReview : review || null,
                };

                const buildOutput = (): ComposerQueriesOutput => {
                    if (!enableDataAccess || terminal.rowCount === 0) {
                        return {
                            result: resultSummary,
                            metadata,
                            structuredContent: { ...summary, preview: null },
                        };
                    }
                    const { truncated } = preview;
                    const truncatedNote = truncated
                        ? `\n(Showing first ${COMPOSER_QUERY_PREVIEW_ROW_LIMIT} of ${terminal.rowCount} rows.)`
                        : '';
                    return {
                        result: `${resultSummary}${truncatedNote}\n${serializeData(
                            preview.csv,
                            'csv',
                        )}`,
                        metadata,
                        structuredContent: {
                            ...summary,
                            preview: { rows: preview.rows, truncated },
                        },
                    };
                };
                const output = buildOutput();

                // Last fallible step: a failure anywhere above registers nothing.
                await registerThreadComposerQueryNodes({
                    threadUuid: prompt.threadUuid,
                    nodes: savedNodes,
                    nodeColumns: {
                        ...toNodeColumns(saved),
                        [resolvedTerminalNodeId]: toComposerNodeColumns(
                            terminal.columns,
                        ),
                    },
                });

                return await persistIfResumed(output);
            } catch (e) {
                if (approvalSql !== null) {
                    await renderState({
                        kind: 'error',
                        sql: approvalSql,
                        message:
                            e instanceof Error ? e.message : 'Unknown error',
                    }).catch(() => {});
                }
                return persistIfResumed(
                    toolErrorOutput(e, 'Error running composer queries.'),
                );
            }
        },
    });
};
