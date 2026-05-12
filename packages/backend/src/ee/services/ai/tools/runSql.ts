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
    SendSlackBlocksFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';
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
    sendSlackBlocks: SendSlackBlocksFn;
};

const truncateForSlack = (sql: string, maxLength = 2500) =>
    sql.length > maxLength
        ? `${sql.slice(0, maxLength)}\n... (truncated)`
        : sql;

const buildSlackApprovalBlocks = (
    toolCallId: string,
    threadUuid: string,
    sql: string,
) => [
    {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: ':lock: *About to run SQL — approve to execute*',
        },
    },
    {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: `\`\`\`sql\n${truncateForSlack(sql)}\n\`\`\``,
        },
    },
    {
        type: 'actions',
        elements: [
            {
                type: 'button',
                text: { type: 'plain_text', text: 'Approve' },
                action_id: `actions.sql_approval:${toolCallId}:${threadUuid}:approved`,
                value: toolCallId,
                style: 'primary',
            },
            {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: "Approve & don't ask again",
                },
                action_id: `actions.sql_approval:${toolCallId}:${threadUuid}:approved_always`,
                value: toolCallId,
            },
            {
                type: 'button',
                text: { type: 'plain_text', text: 'Reject' },
                action_id: `actions.sql_approval:${toolCallId}:${threadUuid}:rejected`,
                value: toolCallId,
                style: 'danger',
            },
        ],
    },
];

const SELECT_OR_WITH = /^\s*(WITH|SELECT)\b/i;
const FORBIDDEN_STATEMENTS =
    /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|MERGE|CALL|EXECUTE)\b/i;

const PREVIEW_ROW_LIMIT = 50;

const validateSelectOnly = (sql: string) => {
    if (!SELECT_OR_WITH.test(sql)) {
        throw new Error('Only SELECT or WITH queries are allowed.');
    }
    if (FORBIDDEN_STATEMENTS.test(sql)) {
        throw new Error(
            'SQL contains forbidden statements (INSERT/UPDATE/DELETE/DDL). Only SELECT queries are allowed.',
        );
    }
};

export const getRunSql = ({
    updateProgress,
    runSqlJob,
    getPrompt,
    sendFile,
    sendSlackBlocks,
}: Dependencies) =>
    tool({
        description: toolRunSqlArgsSchema.description,
        inputSchema: toolRunSqlArgsSchema,
        execute: async ({ sql, limit }, { toolCallId }) => {
            try {
                validateSelectOnly(sql);

                const prompt = await getPrompt();
                const isSlack = isSlackPrompt(prompt);
                const slackAutoApproved =
                    isSlack && isSlackThreadAutoApproved(prompt.threadUuid);

                if (slackAutoApproved) {
                    await updateProgress('Running SQL query...');
                } else {
                    await updateProgress('Awaiting approval to run SQL...');
                }

                // Register the listener first, then trigger any auto-approval
                // (the EventEmitter delivers synchronously, so the order matters).
                const decisionPromise = waitForSqlApproval(toolCallId);

                if (slackAutoApproved) {
                    resolveSqlApproval(toolCallId, 'approved');
                } else if (isSlack) {
                    // Post a separate message with Approve/Reject buttons so
                    // the user can decide without leaving Slack.
                    await sendSlackBlocks({
                        channelId: prompt.slackChannelId,
                        threadTs: prompt.slackThreadTs,
                        organizationUuid: prompt.organizationUuid,
                        text: 'About to run SQL — approve to execute',
                        blocks: buildSlackApprovalBlocks(
                            toolCallId,
                            prompt.threadUuid,
                            sql,
                        ),
                    });
                }

                const decision = await decisionPromise;
                if (decision === 'rejected') {
                    return {
                        result: 'User rejected this SQL execution. Do not retry the same query; ask the user what they would like instead.',
                        metadata: { status: 'rejected' },
                    };
                }
                if (decision === 'timeout') {
                    return {
                        result: 'SQL approval timed out after 5 minutes with no response. The user may have stepped away — acknowledge politely and wait for them to re-ask.',
                        metadata: { status: 'timeout' },
                    };
                }

                await updateProgress('Running SQL query...');

                const { rows, columns, rowCount } = await runSqlJob({
                    sql,
                    limit,
                });

                if (rowCount === 0) {
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
                    {
                        header: true,
                        columns,
                    },
                );

                // For Slack: avoid the noisy auto-expanded CSV file preview by
                // posting a collapsible code block of the first few rows. If
                // the result is large, ALSO upload the full CSV file (Slack
                // file previews are heavy, so we only do it when worth it).
                if (isSlackPrompt(prompt)) {
                    const SLACK_INLINE_ROW_LIMIT = 10;
                    const LARGE_RESULT_THRESHOLD = 25;
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
                    const truncatedNote =
                        rowCount > SLACK_INLINE_ROW_LIMIT
                            ? ` _(showing first ${SLACK_INLINE_ROW_LIMIT})_`
                            : '';
                    await sendSlackBlocks({
                        channelId: prompt.slackChannelId,
                        threadTs: prompt.slackThreadTs,
                        organizationUuid: prompt.organizationUuid,
                        text: `Query returned ${rowCount} rows`,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `*Query returned ${rowCount} row${
                                        rowCount === 1 ? '' : 's'
                                    }*${truncatedNote}\n\`\`\`\n${inlineCsv}\n\`\`\``,
                                },
                            },
                        ],
                    });

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
                    {
                        header: true,
                        columns,
                    },
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
                return {
                    result: toolErrorHandler(e, 'Error running SQL query.'),
                    metadata: { status: 'error' },
                };
            }
        },
    });
