import {
    isSlackPrompt,
    toolRunSqlArgsSchema,
    type AnyType,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import type {
    GetPromptFn,
    RunSqlJobFn,
    SendFileFn,
    UpdateProgressFn,
    UpdateSlackMessageFn,
} from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { renderBlocks, type SectionState } from './slackSqlAggregate';
import {
    isSlackThreadAutoApproved,
    resolveSqlApproval,
    waitForSqlApproval,
} from './sqlApprovals';

type Dependencies = {
    updateProgress: UpdateProgressFn;
    runSqlJob: RunSqlJobFn;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    updateSlackMessage: UpdateSlackMessageFn;
    siteUrl: string;
};

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
}: Dependencies) =>
    tool({
        description: toolRunSqlArgsSchema.description,
        inputSchema: toolRunSqlArgsSchema,
        execute: async ({ sql, limit }, { toolCallId }) => {
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

            // Render a runSql state INTO the bot's existing progress message
            // (the bolt-gif "Thinking…" message at response_slack_ts). One
            // living block — pending → running → result. When the agent
            // moves on, the next updateProgress overwrites with the bolt gif.
            const renderState = async (state: SectionState) => {
                if (!isSlack) return;
                await updateSlackMessage({
                    channelId: prompt.slackChannelId,
                    organizationUuid: prompt.organizationUuid,
                    ts: prompt.response_slack_ts,
                    text: 'SQL execution',
                    blocks: renderBlocks(state, siteUrl),
                });
            };

            try {
                if (slackAutoApproved) {
                    await renderState({ kind: 'approved', sql });
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

                // Register the approval listener first, then trigger any
                // auto-approval (the EventEmitter delivers synchronously, so
                // order matters).
                const decisionPromise = waitForSqlApproval(toolCallId);
                if (slackAutoApproved) {
                    resolveSqlApproval(toolCallId, 'approved');
                }

                const decision = await decisionPromise;
                if (decision === 'rejected') {
                    await renderState({ kind: 'rejected', sql });
                    return {
                        result: 'User rejected this SQL execution. Do not retry the same query; ask the user what they would like instead.',
                        metadata: { status: 'rejected' },
                    };
                }
                if (decision === 'timeout') {
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
                    limit,
                });

                if (rowCount === 0) {
                    await renderState({
                        kind: 'success',
                        sql,
                        rowCount: 0,
                        inlineCsv: '',
                        truncated: false,
                    });
                    return {
                        result: `Query returned 0 rows.${
                            columns.length > 0
                                ? ` Columns: ${columns.join(', ')}`
                                : ''
                        }`,
                        metadata: { status: 'success' },
                    };
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

                return {
                    result: `${rowCount} rows. Columns: ${columns.join(
                        ', ',
                    )}.${truncatedNote}\n${serializeData(previewCsv, 'csv')}`,
                    metadata: { status: 'success' },
                };
            } catch (e) {
                // Post-section errors (runSqlJob threw, Slack call failed,
                // etc.). Reflect the error in the living Slack block so the
                // state isn't stuck on "running" forever.
                const message =
                    e instanceof Error ? e.message : 'Unknown error';
                await renderState({ kind: 'error', sql, message }).catch(() => {
                    /* don't shadow the original error if rendering fails */
                });
                return {
                    result: toolErrorHandler(e, 'Error running SQL query.'),
                    metadata: { status: 'error' },
                };
            }
        },
    });
