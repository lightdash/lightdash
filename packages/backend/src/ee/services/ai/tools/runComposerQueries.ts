import {
    buildComposerArtifactPipeline,
    createToolComposerQueriesArgsSchema,
    getComposerVizPlan,
    getSourceQueryResultReferences,
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
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { type QueryReviewer } from '../decisions/queryReview';
import {
    getDefaultVizNote,
    type PlanComposerViz,
} from '../decisions/vizPlanner';
import type {
    CreateOrUpdateArtifactFn,
    GetPromptFn,
    ListThreadComposerPipelinesFn,
    RecordSqlApprovalFn,
    RunComposerQueriesFn,
    UpdateProgressFn,
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
import { type TrackSqlApprovalTimeoutFn } from './sqlApprovals';

type Dependencies = {
    agentContext: AgentContext;
    reviewQuery?: QueryReviewer;
    planViz?: PlanComposerViz;
    updateProgress: UpdateProgressFn;
    runComposerQueries: RunComposerQueriesFn;
    getPrompt: GetPromptFn;
    waitForSqlApproval: WaitForSqlApprovalFn;
    recordSqlApproval: RecordSqlApprovalFn;
    trackSqlApprovalTimeout: TrackSqlApprovalTimeoutFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    listThreadComposerPipelines: ListThreadComposerPipelinesFn;
    maxQueryLimit: number;
    enableDataAccess: boolean;
    canRunSql: boolean;
    enablePythonNodes: boolean;
    autoApproveSql?: boolean;
    autoApproveSqlUserUuid?: string | null;
};

const toolDefinition = runComposerQueriesToolDefinition.for('agent');

const PREVIEW_ROW_LIMIT = 50;

type ComposerQueriesSuccessMetadata = {
    status: 'success';
    queryUuid: string;
    artifactVersionUuid: string;
};

type ComposerQueriesOutput =
    | ExecuteStructuredToolResult<
          ToolComposerQueriesStructuredContent,
          ComposerQueriesSuccessMetadata
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
    waitForSqlApproval,
    recordSqlApproval,
    trackSqlApprovalTimeout,
    createOrUpdateArtifact,
    listThreadComposerPipelines,
    maxQueryLimit,
    enableDataAccess,
    canRunSql,
    enablePythonNodes,
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
}: Dependencies) => {
    let sqlApprovalTimedOut = false;

    const inputSchema = createToolComposerQueriesArgsSchema({
        maxLimit: maxQueryLimit,
        enablePythonNodes,
    });

    return tool({
        description: getToolComposerQueriesDescription({ enablePythonNodes }),
        inputSchema,
        outputSchema: toolDefinition.outputSchema,
        toModelOutput: toolDefinition.toModelOutput,
        execute: async (
            { title, description, queries: queryNodes, terminalNodeId },
            { toolCallId },
        ): Promise<ComposerQueriesOutput> => {
            try {
                const duplicates = queryNodes
                    .map((node) => node.nodeId)
                    .filter(
                        (nodeId, index, nodeIds) =>
                            nodeIds.indexOf(nodeId) !== index,
                    );
                if (duplicates.length > 0) {
                    return failure(
                        `Duplicate node id(s) in submission: ${duplicates.join(', ')}. Give every node a unique nodeId.`,
                        'error',
                    );
                }

                const prompt = await getPrompt();
                const earlierPipelines = await listThreadComposerPipelines(
                    prompt.threadUuid,
                );
                const queries = buildComposerArtifactPipeline({
                    queries: queryNodes.map(toolComposerQueryNodeToSourceQuery),
                    earlierPipelines,
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
                    return failure(
                        'This pipeline contains "python" nodes but python queries are not enabled. Rebuild the pipeline with duckdb nodes instead.',
                        'error',
                    );
                }

                const sqlNodes = queries.filter(
                    (node) => node.sourceType === QuerySourceType.SQL,
                );
                if (sqlNodes.length > 0 && !canRunSql) {
                    return failure(
                        'This pipeline contains "sql" nodes but SQL execution is not enabled for this agent. Rebuild the pipeline without sql nodes (semanticLayer and duckdb nodes are still available).',
                        'error',
                    );
                }
                sqlNodes.forEach((node) => validateSelectOnly(node.sql));

                // Raw warehouse SQL needs the same human approval gate as
                // runSql; sql reused from an earlier version was approved then.
                if (
                    queryNodes.some(
                        (node) => node.sourceType === QuerySourceType.SQL,
                    )
                ) {
                    if (sqlApprovalTimedOut) {
                        return failure(
                            'A previous SQL approval timed out in this response. Do not call runComposerQueries again in this response; tell the user the SQL was not approved and ask them to retry when ready.',
                            'timeout',
                        );
                    }
                    if (autoApproveSql) {
                        await recordSqlApproval({
                            toolCallId,
                            toolName: 'runComposerQueries',
                            decidedByUserUuid: autoApproveSqlUserUuid,
                            source: 'auto_approve',
                        });
                    } else {
                        await updateProgress('Awaiting approval to run SQL...');
                        const decision = await waitForSqlApproval(toolCallId);
                        if (decision === 'rejected') {
                            return failure(
                                'User rejected this SQL execution. Do not retry the same pipeline; ask the user what they would like instead.',
                                'rejected',
                            );
                        }
                        if (decision === 'timeout') {
                            sqlApprovalTimedOut = true;
                            trackSqlApprovalTimeout({
                                toolCallId,
                                toolName: 'runComposerQueries',
                                promptedUserUuid: prompt.createdByUserUuid,
                                source: isSlackPrompt(prompt) ? 'slack' : 'web',
                            });
                            return failure(
                                'SQL approval timed out after 5 minutes with no response. The user may have stepped away — acknowledge politely and wait for them to re-ask.',
                                'timeout',
                            );
                        }
                    }
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
                    const planned =
                        (await planViz?.({
                            title: title ?? null,
                            description: description ?? null,
                            terminalNode: {
                                title: terminalNode?.title ?? null,
                                description: terminalNode?.description ?? null,
                            },
                            node: terminalNode ?? null,
                            columns: terminal.columns,
                            rows: terminal.rows,
                            rowCount: terminal.rowCount,
                            enableDataAccess,
                            previousVizConfig:
                                earlierPipelines.at(-1)?.vizConfig ?? null,
                        })) ?? null;
                    vizConfig = planned?.vizConfig ?? null;
                    vizNote = planned
                        ? planned.note
                        : getDefaultVizNote(
                              getComposerVizPlan({
                                  columns: Object.values(terminal.columns),
                                  rows: terminal.rows,
                                  node: terminalNode ?? null,
                                  vizConfig: null,
                              }),
                          );
                }
                const artifact = await createOrUpdateArtifact({
                    threadUuid: prompt.threadUuid,
                    promptUuid: prompt.promptUuid,
                    artifactType: 'chart',
                    title: title ?? 'Composer query results',
                    ...(description ? { description } : {}),
                    vizConfig: {
                        source: 'composer',
                        schemaVersion: 1,
                        queries,
                        terminalNodeId: resolvedTerminalNodeId,
                        vizConfig,
                    } satisfies AiComposerChartArtifactConfig,
                });
                if (isSlack && enableDataAccess) {
                    agentContext.registerSlackTableResults(terminal.queryUuid, {
                        rows: terminal.rows,
                        fields: {},
                    });
                }
                const metadata: ComposerQueriesSuccessMetadata = {
                    status: 'success',
                    queryUuid: terminal.queryUuid,
                    artifactVersionUuid: artifact.versionUuid,
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
                    ...(isSlack
                        ? [
                              `This execution's queryUuid is ${terminal.queryUuid}; use exactly this value to reference it.`,
                          ]
                        : []),
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
                    return {
                        result: `${resultSummary}${vizLine}`,
                        metadata,
                        structuredContent: { ...summary, preview: null },
                    };
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

                return {
                    result: `${resultSummary}${truncatedNote}\n${serializeData(
                        previewCsv,
                        'csv',
                    )}${vizLine}`,
                    metadata,
                    structuredContent: {
                        ...summary,
                        preview: { rows: previewRows, truncated },
                    },
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error running composer queries.');
            }
        },
    });
};
