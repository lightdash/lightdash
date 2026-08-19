import {
    createToolComposerQueriesArgsSchema,
    isSlackPrompt,
    QuerySourceType,
    runComposerQueriesToolDefinition,
    toolComposerQueryNodeToSourceQuery,
    type AiComposerChartArtifactConfig,
    type AnyType,
    type SourceQuery,
    type ToolComposerQueriesArgs,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import type {
    CreateOrUpdateArtifactFn,
    GetPromptFn,
    RecordSqlApprovalFn,
    RunComposerQueriesFn,
    UpdateProgressFn,
    WaitForSqlApprovalFn,
} from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { validateSelectOnly } from './runSql';

type Dependencies = {
    updateProgress: UpdateProgressFn;
    runComposerQueries: RunComposerQueriesFn;
    getPrompt: GetPromptFn;
    waitForSqlApproval: WaitForSqlApprovalFn;
    recordSqlApproval: RecordSqlApprovalFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    maxQueryLimit: number;
    enableDataAccess: boolean;
    canRunSql: boolean;
    autoApproveSql?: boolean;
    autoApproveSqlUserUuid?: string | null;
};

const toolDefinition = runComposerQueriesToolDefinition.for('agent');

const PREVIEW_ROW_LIMIT = 50;

/**
 * Resolves which node the artifact should show: the explicit terminalNodeId
 * when given, otherwise the unique sink (the one node no other node
 * references in-submission). Throws a model-actionable error otherwise.
 */
export const resolveTerminalNodeId = (
    queries: ToolComposerQueriesArgs['queries'],
    terminalNodeId: string | null,
): string => {
    const nodeIds = new Set(queries.map((query) => query.nodeId));
    if (terminalNodeId !== null) {
        if (!nodeIds.has(terminalNodeId)) {
            throw new Error(
                `terminalNodeId "${terminalNodeId}" does not name a node in this submission`,
            );
        }
        return terminalNodeId;
    }

    const referenced = new Set<string>();
    queries.forEach((query) => {
        if (query.sourceType !== QuerySourceType.DUCKDB) return;
        const references = Array.isArray(query.references)
            ? query.references
            : Object.values(query.references);
        references
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
    updateProgress,
    runComposerQueries,
    getPrompt,
    waitForSqlApproval,
    recordSqlApproval,
    createOrUpdateArtifact,
    maxQueryLimit,
    enableDataAccess,
    canRunSql,
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
}: Dependencies) => {
    let sqlApprovalTimedOut = false;

    const inputSchema = createToolComposerQueriesArgsSchema({
        maxLimit: maxQueryLimit,
    });

    return tool({
        description: toolDefinition.description,
        inputSchema,
        outputSchema: toolDefinition.outputSchema,
        toModelOutput: toolDefinition.toModelOutput,
        execute: async (
            { title, description, queries: queryNodes, terminalNodeId },
            { toolCallId },
        ) => {
            try {
                const duplicates = queryNodes
                    .map((node) => node.nodeId)
                    .filter(
                        (nodeId, index, nodeIds) =>
                            nodeIds.indexOf(nodeId) !== index,
                    );
                if (duplicates.length > 0) {
                    return {
                        result: `Duplicate node id(s) in submission: ${duplicates.join(', ')}. Give every node a unique nodeId.`,
                        metadata: { status: 'error' as const },
                    };
                }

                const resolvedTerminalNodeId = resolveTerminalNodeId(
                    queryNodes,
                    terminalNodeId,
                );

                const sqlNodes = queryNodes.filter(
                    (node) => node.sourceType === QuerySourceType.SQL,
                );
                if (sqlNodes.length > 0 && !canRunSql) {
                    return {
                        result: 'This pipeline contains "sql" nodes but SQL execution is not enabled for this agent. Rebuild the pipeline without sql nodes (semanticLayer and duckdb nodes are still available).',
                        metadata: { status: 'error' as const },
                    };
                }
                sqlNodes.forEach((node) => validateSelectOnly(node.sql));

                // Row limits are already capped at parse time — the input
                // schema is built with maxLimit: maxQueryLimit.
                const queries: SourceQuery[] = queryNodes.map(
                    toolComposerQueryNodeToSourceQuery,
                );

                // Raw warehouse SQL needs the same per-thread human approval
                // gate as runSql. Pipelines with only semanticLayer/duckdb
                // nodes run without approval.
                if (sqlNodes.length > 0) {
                    if (sqlApprovalTimedOut) {
                        return {
                            result: 'A previous SQL approval timed out in this response. Do not call runComposerQueries again in this response; tell the user the SQL was not approved and ask them to retry when ready.',
                            metadata: { status: 'timeout' as const },
                        };
                    }
                    if (autoApproveSql) {
                        await recordSqlApproval(
                            toolCallId,
                            'approved',
                            autoApproveSqlUserUuid,
                        );
                    } else {
                        await updateProgress('Awaiting approval to run SQL...');
                        const decision = await waitForSqlApproval(toolCallId);
                        if (decision === 'rejected') {
                            return {
                                result: 'User rejected this SQL execution. Do not retry the same pipeline; ask the user what they would like instead.',
                                metadata: { status: 'rejected' as const },
                            };
                        }
                        if (decision === 'timeout') {
                            sqlApprovalTimedOut = true;
                            return {
                                result: 'SQL approval timed out after 5 minutes with no response. The user may have stepped away — acknowledge politely and wait for them to re-ask.',
                                metadata: { status: 'timeout' as const },
                            };
                        }
                    }
                }

                await updateProgress('Running composer queries...');

                const { submissions, terminal } = await runComposerQueries({
                    queries,
                    terminalNodeId: resolvedTerminalNodeId,
                });

                const prompt = await getPrompt();
                // v0 surface is web chat only; keep Slack (if ever assembled
                // there) to the text result without an artifact.
                if (!isSlackPrompt(prompt)) {
                    await createOrUpdateArtifact({
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
                            lastQueryUuid: terminal.queryUuid,
                        } satisfies AiComposerChartArtifactConfig,
                    });
                }

                const nodeSummary = submissions
                    .map(
                        (submission) =>
                            `- ${submission.nodeId} (${submission.sourceType}): queryUuid ${submission.queryUuid}`,
                    )
                    .join('\n');
                const columnReferences = Object.keys(terminal.columns);
                const columnSummary = Object.values(terminal.columns)
                    .map((column) => `${column.reference} (${column.type})`)
                    .join(', ');
                const resultSummary = [
                    `Composer query complete. Terminal node "${resolvedTerminalNodeId}" returned ${terminal.rowCount} rows (queryUuid ${terminal.queryUuid} — reference it in a later submission via the map form of "references").`,
                    `Submitted nodes:\n${nodeSummary}`,
                    `Terminal columns: ${columnSummary}.`,
                ].join('\n');

                if (!enableDataAccess || terminal.rowCount === 0) {
                    return {
                        result: resultSummary,
                        metadata: { status: 'success' as const },
                    };
                }

                const previewRows = terminal.rows.slice(0, PREVIEW_ROW_LIMIT);
                const previewCsv = stringify(
                    previewRows.map((row) =>
                        columnReferences.reduce<Record<string, AnyType>>(
                            (acc, col) => {
                                acc[col] = row[col];
                                return acc;
                            },
                            {},
                        ),
                    ),
                    { header: true, columns: columnReferences },
                );
                const truncatedNote =
                    terminal.rowCount > PREVIEW_ROW_LIMIT
                        ? `\n(Showing first ${PREVIEW_ROW_LIMIT} of ${terminal.rowCount} rows.)`
                        : '';

                return {
                    result: `${resultSummary}${truncatedNote}\n${serializeData(
                        previewCsv,
                        'csv',
                    )}`,
                    metadata: { status: 'success' as const },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error running composer queries.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
};
