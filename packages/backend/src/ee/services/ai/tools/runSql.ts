import {
    buildRunSqlDescription,
    createToolRunSqlArgsSchema,
    isSlackPrompt,
    runSqlToolDefinition,
    type AnyType,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import type {
    GetPromptFn,
    RecordSqlApprovalFn,
    RunSqlJobFn,
    SendFileFn,
    StoreToolResultsFn,
    UpdateProgressFn,
    UpdateSlackMessageFn,
    WaitForSqlApprovalFn,
} from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { renderBlocks, type SectionState } from './slackSqlAggregate';
import { isSlackThreadAutoApproved } from './sqlApprovals';

type Dependencies = {
    updateProgress: UpdateProgressFn;
    runSqlJob: RunSqlJobFn;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    updateSlackMessage: UpdateSlackMessageFn;
    siteUrl: string;
    waitForSqlApproval: WaitForSqlApprovalFn;
    recordSqlApproval: RecordSqlApprovalFn;
    storeToolResults: StoreToolResultsFn;
    maxQueryLimit: number;
    autoApproveSql?: boolean;
    autoApproveSqlUserUuid?: string | null;
    useSlackStreamCard?: boolean;
};

const toolDefinition = runSqlToolDefinition.for('agent');

// Strip --line and /* block */ comments + string literals so subsequent
// keyword checks don't false-positive on text that's inside a comment or a
// string. We don't execute the stripped version — it's used purely for
// validation.
const SQL_COMMENTS_AND_STRINGS = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/g;
const stripCommentsAndStrings = (sql: string): string =>
    sql.replace(SQL_COMMENTS_AND_STRINGS, ' ');

const STARTS_WITH_SELECT_OR_WITH = /^\s*(WITH|SELECT)\b/i;
const FORBIDDEN_STATEMENTS =
    /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|MERGE|CALL|EXECUTE)\b/i;
const INFORMATION_SCHEMA = /\binformation_schema\b/i;

const PREVIEW_ROW_LIMIT = 50;
const SLACK_INLINE_ROW_LIMIT = 10;
const LARGE_RESULT_THRESHOLD = 25;

const validateSelectOnly = (sql: string) => {
    const stripped = stripCommentsAndStrings(sql);
    if (!STARTS_WITH_SELECT_OR_WITH.test(stripped)) {
        throw new Error('Only SELECT or WITH queries are allowed.');
    }
    if (FORBIDDEN_STATEMENTS.test(stripped)) {
        throw new Error(
            'SQL contains forbidden statements (INSERT/UPDATE/DELETE/DDL). Only SELECT queries are allowed.',
        );
    }
    if (INFORMATION_SCHEMA.test(stripped)) {
        throw new Error(
            'Querying information_schema is forbidden. Use describeWarehouseTable for column discovery on a raw table, or listWarehouseTables to find table names. If neither returns what you need, ask the user — do not introspect via SQL.',
        );
    }
};

export const getRunSql = ({
    updateProgress,
    runSqlJob,
    getPrompt,
    sendFile,
    updateSlackMessage,
    siteUrl,
    waitForSqlApproval,
    recordSqlApproval,
    storeToolResults,
    maxQueryLimit,
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
    useSlackStreamCard = false,
}: Dependencies) => {
    let sqlApprovalTimedOut = false;

    const inputSchema = createToolRunSqlArgsSchema({
        maxLimit: maxQueryLimit,
    });

    // Modern Slack path uses the AI SDK's native tool approval: the loop halts
    // on a tool-approval-request and the worker job ends; a resume job re-runs
    // generation and the SDK re-invokes execute once approved. Auto-approve and
    // "don't ask again" threads bypass approval entirely.
    const usesNativeApproval = async () => {
        if (!useSlackStreamCard || autoApproveSql) return false;
        const prompt = await getPrompt();
        return (
            isSlackPrompt(prompt) &&
            !isSlackThreadAutoApproved(prompt.threadUuid)
        );
    };

    return tool({
        description: buildRunSqlDescription(500, maxQueryLimit),
        inputSchema,
        outputSchema: toolDefinition.outputSchema,
        toModelOutput: toolDefinition.toModelOutput,
        needsApproval: usesNativeApproval,
        execute: async ({ sql, limit }, { toolCallId }) => {
            if (sqlApprovalTimedOut) {
                return {
                    result: 'A previous SQL approval timed out in this response. Do not call runSql again in this response; tell the user the SQL was not approved and ask them to retry when ready.',
                    metadata: { status: 'timeout' },
                };
            }

            // Pre-section errors (bad SQL shape) — no Slack message exists
            // yet, just return the error to the agent.
            try {
                validateSelectOnly(sql);
            } catch (e) {
                return {
                    result: toolErrorHandler(e, 'Error running SQL query.'),
                    metadata: { status: 'error' },
                };
            }

            const prompt = await getPrompt();
            const isSlack = isSlackPrompt(prompt);
            const slackAutoApproved =
                isSlack && isSlackThreadAutoApproved(prompt.threadUuid);
            const shouldAutoApprove = autoApproveSql || slackAutoApproved;
            // When native approval gated this call, execute only runs after the
            // user approved (or auto-approve). No blocking wait, no pending card
            // — the reply flow posted the approval card and the decision is
            // already recorded.
            const isNativeApprovalPath =
                useSlackStreamCard && isSlack && !shouldAutoApprove;

            // When execute runs as a RESUME of a previously-suspended approval,
            // onStepFinish won't persist the result (the tool call was made in a
            // prior run), so we persist it here. Otherwise the call is left
            // result-less — which re-triggers execution on later turns and
            // shows a stale approval card on the web. A resume is identified
            // either by the native path, or (when "don't ask again" flipped the
            // thread to auto-approve) by the decision already being recorded.
            let isResumeExecution = isNativeApprovalPath;
            const persistResumeResult = async <
                T extends { result: string; metadata: AnyType },
            >(
                output: T,
            ): Promise<T> => {
                if (isResumeExecution) {
                    await storeToolResults([
                        {
                            promptUuid: prompt.promptUuid,
                            toolCallId,
                            toolName: 'runSql',
                            result: output.result,
                            metadata: output.metadata,
                        },
                    ]).catch(() => {
                        // Best-effort; the model already has the result.
                    });
                }
                return output;
            };

            // Render a runSql state INTO the bot's existing progress message
            // (the bolt-gif "Thinking…" message at response_slack_ts). One
            // living block — pending → running → result. When the agent
            // moves on, the next updateProgress overwrites with the bolt gif.
            const renderState = async (state: SectionState) => {
                if (!isSlack) return;
                // Modern card shows progress itself; only the approval buttons still need the legacy placeholder.
                if (useSlackStreamCard && state.kind !== 'pending') return;
                await updateSlackMessage({
                    channelId: prompt.slackChannelId,
                    organizationUuid: prompt.organizationUuid,
                    ts: prompt.response_slack_ts,
                    text: 'SQL execution',
                    blocks: renderBlocks(state, siteUrl),
                });
            };

            try {
                if (shouldAutoApprove) {
                    if (isSlack) {
                        await renderState({ kind: 'approved', sql });
                    }
                    const recorded = await recordSqlApproval(
                        toolCallId,
                        'approved',
                        autoApproveSql ? autoApproveSqlUserUuid : null,
                    );
                    // A pre-existing decision means this is a resume (the button
                    // recorded it), so onStepFinish won't persist the result.
                    if (!recorded) {
                        isResumeExecution = true;
                    }
                } else if (isNativeApprovalPath) {
                    // Approval already handled by the SDK before this call.
                } else if (isSlack) {
                    await renderState({
                        kind: 'pending',
                        sql,
                        toolCallId,
                        threadUuid: prompt.threadUuid,
                    });
                } else {
                    await updateProgress('Awaiting approval to run SQL...');
                }

                const decision =
                    shouldAutoApprove || isNativeApprovalPath
                        ? 'approved'
                        : await waitForSqlApproval(toolCallId);
                if (decision === 'rejected') {
                    await renderState({ kind: 'rejected', sql });
                    return {
                        result: 'User rejected this SQL execution. Do not retry the same query; ask the user what they would like instead.',
                        metadata: { status: 'rejected' },
                    };
                }
                if (decision === 'timeout') {
                    sqlApprovalTimedOut = true;
                    await renderState({ kind: 'timeout', sql });
                    return {
                        result: 'SQL approval timed out after 5 minutes with no response. The user may have stepped away — acknowledge politely and wait for them to re-ask.',
                        metadata: { status: 'timeout' },
                    };
                }

                if (isSlack) {
                    await renderState({ kind: 'running', sql });
                } else {
                    await updateProgress('Running SQL query...');
                }

                const { rows, columns, rowCount } = await runSqlJob({
                    sql,
                    limit: Math.min(limit, maxQueryLimit),
                });

                if (rowCount === 0) {
                    await renderState({
                        kind: 'success',
                        sql,
                        rowCount: 0,
                        inlineCsv: '',
                        truncated: false,
                    });
                    return await persistResumeResult({
                        result: `Query returned 0 rows.${
                            columns.length > 0
                                ? ` Columns: ${columns.join(', ')}`
                                : ''
                        }`,
                        metadata: { status: 'success', rowCount: 0 },
                    });
                }

                const csv = stringify(
                    rows.map((row) =>
                        columns.reduce<Record<string, AnyType>>((acc, col) => {
                            acc[col] = row[col];
                            return acc;
                        }, {}),
                    ),
                    { header: true, columns },
                );

                if (isSlack) {
                    const inlineRows = rows.slice(0, SLACK_INLINE_ROW_LIMIT);
                    const inlineCsv = stringify(
                        inlineRows.map((row) =>
                            columns.reduce<Record<string, AnyType>>(
                                (acc, col) => {
                                    acc[col] = row[col];
                                    return acc;
                                },
                                {},
                            ),
                        ),
                        { header: true, columns },
                    );

                    await renderState({
                        kind: 'success',
                        sql,
                        rowCount,
                        inlineCsv,
                        truncated: rowCount > SLACK_INLINE_ROW_LIMIT,
                    });

                    // chat.update can't attach files, so a full CSV for large
                    // results still goes as a separate message.
                    if (rowCount > LARGE_RESULT_THRESHOLD) {
                        await sendFile({
                            channelId: prompt.slackChannelId,
                            threadTs: prompt.slackThreadTs,
                            organizationUuid: prompt.organizationUuid,
                            title: 'Full SQL query results',
                            comment: `Full CSV — ${rowCount} rows`,
                            filename: 'lightdash-sql-results.csv',
                            file: Buffer.from(csv, 'utf-8'),
                        });
                    }
                }

                const previewRows = rows.slice(0, PREVIEW_ROW_LIMIT);
                const previewCsv = stringify(
                    previewRows.map((row) =>
                        columns.reduce<Record<string, AnyType>>((acc, col) => {
                            acc[col] = row[col];
                            return acc;
                        }, {}),
                    ),
                    { header: true, columns },
                );

                const truncatedNote =
                    rowCount > PREVIEW_ROW_LIMIT
                        ? `\n(Showing first ${PREVIEW_ROW_LIMIT} of ${rowCount} rows.)`
                        : '';

                return await persistResumeResult({
                    result: `${rowCount} rows. Columns: ${columns.join(
                        ', ',
                    )}.${truncatedNote}\n${serializeData(previewCsv, 'csv')}`,
                    metadata: { status: 'success', rowCount },
                });
            } catch (e) {
                // Post-section errors (runSqlJob threw, Slack call failed,
                // etc.). Reflect the error in the living Slack block so the
                // state isn't stuck on "running" forever.
                const message =
                    e instanceof Error ? e.message : 'Unknown error';
                await renderState({ kind: 'error', sql, message }).catch(() => {
                    /* don't shadow the original error if rendering fails */
                });
                return persistResumeResult({
                    result: toolErrorHandler(e, 'Error running SQL query.'),
                    metadata: { status: 'error' },
                });
            }
        },
    });
};
