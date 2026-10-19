import {
    buildComposerArtifactPipeline,
    createToolComposerQueriesArgsSchema,
    getComposerVizPlan,
    getSourceQueryResultReferences,
    getSqlApprovalSql,
    getToolComposerQueriesDescription,
    isSlackPrompt,
    QuerySourceType,
    runComposerQueriesToolDefinition,
    toolComposerQueryNodeToSourceQuery,
    type AiComposerChartArtifactConfig,
    type AnyType,
    type SourceQuery,
    type ToolComposerQueriesArgs,
    type ToolComposerQueriesStructuredContent,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { type QueryReviewer } from '../decisions/queryReview';
import {
    getDefaultVizNote,
    getVizConfigNote,
    type PlanComposerViz,
} from '../decisions/vizPlanner';
import type {
    CreateOrUpdateArtifactFn,
    GetLatestComposerVizConfigFn,
    GetPromptFn,
    IsThreadSqlAutoApprovedFn,
    ListSqlApprovalDecisionsFn,
    ListThreadComposerQueryNodesFn,
    RecordSqlApprovalFn,
    RegisterThreadComposerQueryNodesFn,
    RunComposerQueriesFn,
    StoreToolResultsFn,
    UpdateProgressFn,
    UpdateSlackMessageFn,
    WaitForSqlApprovalFn,
} from '../types/aiAgentDependencies';
import { type AgentContext } from '../utils/AgentContext';
import { serializeData } from '../utils/serializeData';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { validateSelectOnly } from './runSql';
import { getSqlApprovalSteps } from './slackSqlAggregate';
import { createSqlApprovalGate, type SqlApprovalCopy } from './sqlApprovalGate';
import {
    COMPOSER_SQL_REJECTED_RESULT,
    getSqlApprovalHeading,
    SqlNotApprovedError,
    type TrackSqlApprovalTimeoutFn,
} from './sqlApprovals';

type Dependencies = {
    agentContext: AgentContext;
    reviewQuery?: QueryReviewer;
    planViz?: PlanComposerViz;
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
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    listThreadComposerQueryNodes: ListThreadComposerQueryNodesFn;
    registerThreadComposerQueryNodes: RegisterThreadComposerQueryNodesFn;
    getLatestComposerVizConfig: GetLatestComposerVizConfigFn;
    maxQueryLimit: number;
    enableDataAccess: boolean;
    canRunSql: boolean;
    enablePythonNodes: boolean;
    autoApproveSql?: boolean;
    autoApproveSqlUserUuid?: string | null;
    useSlackStreamCard?: boolean;
};

const toolDefinition = runComposerQueriesToolDefinition.for('agent');

const PREVIEW_ROW_LIMIT = 50;

const COMPOSER_SQL_APPROVAL_COPY: SqlApprovalCopy = {
    slackText: 'SQL execution',
    pendingProgress: 'Awaiting approval to run SQL...',
    // The tool reports its own progress once approved.
    approvedProgress: null,
    rejectedResult: COMPOSER_SQL_REJECTED_RESULT,
    timeoutResult:
        'SQL approval timed out after 5 minutes with no response. The user may have stepped away — acknowledge politely and wait for them to re-ask.',
    previousTimeoutResult:
        'A previous SQL approval timed out in this response. Do not call runComposerQueries again in this response; tell the user the SQL was not approved and ask them to retry when ready.',
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

/**
 * Resolves which node the artifact should show: the explicit terminalNodeId
 * when given, otherwise the unique sink (the one node no other node
 * references in-submission). Throws a model-actionable error otherwise.
 */
export const resolveTerminalNodeId = (
    queries: ToolComposerQueriesArgs['queries'],
    terminalNodeId: string | null,
    pipeline: SourceQuery[],
): string => {
    const nodeIds = new Set(queries.map((query) => query.nodeId));
    if (terminalNodeId !== null) {
        if (!pipeline.some((node) => node.nodeId === terminalNodeId)) {
            throw new Error(
                `terminalNodeId "${terminalNodeId}" does not name a node in this pipeline`,
            );
        }
        return terminalNodeId;
    }

    const referenced = new Set<string>();
    queries.forEach((query) => {
        Object.values(
            getSourceQueryResultReferences(
                toolComposerQueryNodeToSourceQuery(query),
            ),
        )
            .filter((reference) => nodeIds.has(reference))
            .forEach((reference) => referenced.add(reference));
    });

    const sinks = queries
        .map((query) => query.nodeId)
        .filter((nodeId) => !referenced.has(nodeId));
    if (sinks.length !== 1) {
        throw new Error(
            `The pipeline has ${sinks.length} sinks (${sinks.join(
                ', ',
            )}); pass terminalNodeId to pick which node's result the artifact shows`,
        );
    }
    return sinks[0];
};

export const getRunComposerQueries = ({
    agentContext,
    reviewQuery,
    planViz,
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
    createOrUpdateArtifact,
    listThreadComposerQueryNodes,
    registerThreadComposerQueryNodes,
    getLatestComposerVizConfig,
    maxQueryLimit,
    enableDataAccess,
    canRunSql,
    enablePythonNodes,
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
    useSlackStreamCard = false,
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
        'runComposerQueries',
        COMPOSER_SQL_APPROVAL_COPY,
    );

    const inputSchema = createToolComposerQueriesArgsSchema({
        maxLimit: maxQueryLimit,
        enablePythonNodes,
    });

    return tool({
        description: getToolComposerQueriesDescription({ enablePythonNodes }),
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
                const duplicates = queryNodes
                    .map((node) => node.nodeId)
                    .filter(
                        (nodeId, index, nodeIds) =>
                            nodeIds.indexOf(nodeId) !== index,
                    );
                if (duplicates.length > 0) {
                    return await persistIfResumed(
                        failure(
                            `Duplicate node id(s) in submission: ${duplicates.join(', ')}. Give every node a unique nodeId.`,
                            'error',
                        ),
                    );
                }

                const prompt = await getPrompt();
                const queries = buildComposerArtifactPipeline({
                    queries: queryNodes.map(toolComposerQueryNodeToSourceQuery),
                    threadNodes: await listThreadComposerQueryNodes(
                        prompt.threadUuid,
                    ),
                });
                const resolvedTerminalNodeId = resolveTerminalNodeId(
                    queryNodes,
                    terminalNodeId,
                    queries,
                );

                if (
                    !enablePythonNodes &&
                    queries.some(
                        (node) => node.sourceType === QuerySourceType.PYTHON,
                    )
                ) {
                    return await persistIfResumed(
                        failure(
                            'This pipeline contains "python" nodes but python queries are not enabled. Rebuild the pipeline with duckdb nodes instead.',
                            'error',
                        ),
                    );
                }

                const sqlNodes = queries.filter(
                    (node) => node.sourceType === QuerySourceType.SQL,
                );
                if (sqlNodes.length > 0 && !canRunSql) {
                    return await persistIfResumed(
                        failure(
                            'This pipeline contains "sql" nodes but SQL execution is not enabled for this agent. Rebuild the pipeline without sql nodes (semanticLayer and duckdb nodes are still available).',
                            'error',
                        ),
                    );
                }
                sqlNodes.forEach((node) => validateSelectOnly(node.sql));

                if (approvalSql !== null) {
                    try {
                        await approveSql({
                            sql: approvalSql,
                            heading:
                                getSqlApprovalHeading('runComposerQueries'),
                            steps: getSqlApprovalSteps(
                                'runComposerQueries',
                                args,
                            ),
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

                const [{ terminal }, review] = await Promise.all([
                    runComposerQueries({
                        queries,
                        terminalNodeId: resolvedTerminalNodeId,
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
                                'runComposerQueries',
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

                await registerThreadComposerQueryNodes({
                    threadUuid: prompt.threadUuid,
                    nodes: queries,
                });

                if (approvalSql !== null) {
                    await renderState({
                        kind: 'success',
                        sql: approvalSql,
                        rowCount: terminal.rowCount,
                        inlineCsv: '',
                        truncated: false,
                    });
                }

                // Slack renders composer results as a native table, so it skips
                // viz planning; the artifact backs the thread link.
                const isSlack = isSlackPrompt(prompt);
                const terminalNode = queries.find(
                    (query) => query.nodeId === resolvedTerminalNodeId,
                );
                let vizNote: string | null = null;
                let vizConfig: AiComposerChartArtifactConfig['vizConfig'] =
                    null;
                if (!isSlack) {
                    vizConfig =
                        (await planViz?.({
                            title: title ?? null,
                            description: description ?? null,
                            terminalNode: {
                                title: terminalNode?.title ?? null,
                                description: terminalNode?.description ?? null,
                            },
                            columns: terminal.columns,
                            rows: terminal.rows,
                            rowCount: terminal.rowCount,
                            enableDataAccess,
                            previousVizConfig: await getLatestComposerVizConfig(
                                prompt.threadUuid,
                            ),
                        })) ?? null;
                    vizNote = vizConfig
                        ? getVizConfigNote(vizConfig)
                        : getDefaultVizNote(
                              getComposerVizPlan({
                                  columns: Object.values(terminal.columns),
                                  rows: terminal.rows,
                                  node: terminalNode ?? null,
                                  vizConfig: null,
                              }),
                          );
                }
                const artifactTitle = title ?? 'Composer query results';
                // Web saves an artifact version only when the answer presents
                // the terminal node; Slack tables still need one per call.
                const slackArtifact = isSlack
                    ? await createOrUpdateArtifact({
                          threadUuid: prompt.threadUuid,
                          promptUuid: prompt.promptUuid,
                          artifactType: 'chart',
                          title: artifactTitle,
                          ...(description ? { description } : {}),
                          vizConfig: {
                              source: 'composer',
                              schemaVersion: 1,
                              queries,
                              terminalNodeId: resolvedTerminalNodeId,
                              vizConfig,
                          } satisfies AiComposerChartArtifactConfig,
                      })
                    : null;
                if (isSlack && enableDataAccess) {
                    agentContext.registerSlackTableResults(terminal.queryUuid, {
                        rows: terminal.rows,
                        fields: {},
                    });
                }
                const metadata: ToolComposerQueriesSuccessMetadata = {
                    status: 'success',
                    queryUuid: terminal.queryUuid,
                    terminalNodeId: resolvedTerminalNodeId,
                    snapshot: queries,
                    vizConfig,
                    title: artifactTitle,
                    description: description ?? null,
                    artifactVersionUuid: slackArtifact?.versionUuid ?? null,
                };

                const nodes = queries.map((node) => ({
                    nodeId: node.nodeId,
                    title: node.title ?? null,
                    sourceType: node.sourceType,
                }));
                const nodeSummary = nodes
                    .map((node) =>
                        node.title === null
                            ? `- ${node.nodeId} (${node.sourceType})`
                            : `- ${node.nodeId}: "${node.title}" (${node.sourceType})`,
                    )
                    .join('\n');
                const columns = Object.values(terminal.columns).map(
                    ({ reference, type }) => ({ reference, type }),
                );
                const columnReferences = columns.map(
                    (column) => column.reference,
                );
                const columnSummary = columns
                    .map((column) => `${column.reference} (${column.type})`)
                    .join(', ');
                const emptyReview =
                    enableDataAccess && reviewQuery && terminal.rowCount === 0
                        ? await reviewQuery(
                              {
                                  kind: 'composer',
                                  queries,
                                  terminalNodeId: resolvedTerminalNodeId,
                              },
                              { emptyResult: true, review },
                          )
                        : null;
                const resultSummary = [
                    `Composer query complete. Terminal node "${resolvedTerminalNodeId}" returned ${terminal.rowCount} rows.`,
                    `Nodes in this pipeline (a later call can read any of them by node id without resubmitting it):\n${nodeSummary}`,
                    `Terminal columns: ${columnSummary}.`,
                    isSlack
                        ? `This execution's queryUuid is ${terminal.queryUuid}; use exactly this value to reference it.`
                        : `Not shown to the user yet. To show this result, write <show node="${resolvedTerminalNodeId}"/> in your final answer.`,
                    ...(review && terminal.rowCount !== 0 ? [review] : []),
                    ...(emptyReview !== null ? [emptyReview] : []),
                ].join('\n');
                const summary = {
                    terminalNodeId: resolvedTerminalNodeId,
                    rowCount: terminal.rowCount,
                    nodes,
                    columns,
                    visualization: vizNote,
                    review:
                        terminal.rowCount === 0 ? emptyReview : review || null,
                };

                const vizLine = vizNote ? `\n${vizNote}` : '';
                if (!enableDataAccess || terminal.rowCount === 0) {
                    return await persistIfResumed({
                        result: `${resultSummary}${vizLine}`,
                        metadata,
                        structuredContent: { ...summary, preview: null },
                    });
                }

                const previewRows = terminal.rows
                    .slice(0, PREVIEW_ROW_LIMIT)
                    .map((row) =>
                        columnReferences.reduce<Record<string, AnyType>>(
                            (acc, col) => {
                                acc[col] = row[col];
                                return acc;
                            },
                            {},
                        ),
                    );
                const previewCsv = stringify(previewRows, {
                    header: true,
                    columns: columnReferences,
                });
                const truncated = terminal.rowCount > PREVIEW_ROW_LIMIT;
                const truncatedNote = truncated
                    ? `\n(Showing first ${PREVIEW_ROW_LIMIT} of ${terminal.rowCount} rows.)`
                    : '';

                return await persistIfResumed({
                    result: `${resultSummary}${truncatedNote}\n${serializeData(
                        previewCsv,
                        'csv',
                    )}${vizLine}`,
                    metadata,
                    structuredContent: {
                        ...summary,
                        preview: { rows: previewRows, truncated },
                    },
                });
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
