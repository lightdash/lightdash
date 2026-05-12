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
    UpdateSlackMessageFn,
} from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    getAggregate,
    renderAggregateBlocks,
    setAggregate,
    upsertSection,
    type AggregateSection,
    type SectionState,
} from './slackSqlAggregate';
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
    updateSlackMessage: UpdateSlackMessageFn;
};

const SELECT_OR_WITH = /^\s*(WITH|SELECT)\b/i;
const FORBIDDEN_STATEMENTS =
    /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|MERGE|CALL|EXECUTE)\b/i;
const INFORMATION_SCHEMA = /\binformation_schema\b/i;

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
    if (INFORMATION_SCHEMA.test(sql)) {
        throw new Error(
            'Querying information_schema is forbidden. Use findFields (for explore-backed tables) or listWarehouseTables (for raw tables) to discover schema. If neither returns what you need, ask the user — do not introspect via SQL.',
        );
    }
};

export const getRunSql = ({
    updateProgress,
    runSqlJob,
    getPrompt,
    sendFile,
    sendSlackBlocks,
    updateSlackMessage,
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

                // Helper: push a new state for this section and re-render the
                // aggregate Slack message. No-op when not in Slack.
                const updateSection = async (state: SectionState) => {
                    if (!isSlack) return;
                    const section: AggregateSection = {
                        toolCallId,
                        threadUuid: prompt.threadUuid,
                        state,
                    };
                    upsertSection(prompt.promptUuid, section);
                    const agg = getAggregate(prompt.promptUuid);
                    if (!agg) return;
                    await updateSlackMessage({
                        channelId: agg.channelId,
                        organizationUuid: prompt.organizationUuid,
                        ts: agg.messageTs,
                        text: 'SQL execution',
                        blocks: renderAggregateBlocks(agg),
                    });
                };

                if (slackAutoApproved) {
                    await updateProgress('Running SQL query...');
                } else {
                    await updateProgress('Awaiting approval to run SQL...');
                }

                // Register the approval listener first, then trigger any
                // auto-approval (the EventEmitter delivers synchronously, so
                // the order matters).
                const decisionPromise = waitForSqlApproval(toolCallId);

                if (isSlack) {
                    const initialState: SectionState = slackAutoApproved
                        ? { kind: 'approved', sql }
                        : { kind: 'pending', sql };
                    const section: AggregateSection = {
                        toolCallId,
                        threadUuid: prompt.threadUuid,
                        state: initialState,
                    };
                    const existing = getAggregate(prompt.promptUuid);
                    if (!existing) {
                        // First runSql in this turn — post a new aggregate
                        // message and remember its ts so subsequent calls
                        // can edit it in place.
                        const { ts } = await sendSlackBlocks({
                            channelId: prompt.slackChannelId,
                            threadTs: prompt.slackThreadTs,
                            organizationUuid: prompt.organizationUuid,
                            text: 'SQL execution',
                            blocks: renderAggregateBlocks({
                                channelId: prompt.slackChannelId,
                                messageTs: '',
                                sections: [section],
                            }),
                        });
                        if (ts) {
                            setAggregate(prompt.promptUuid, {
                                channelId: prompt.slackChannelId,
                                messageTs: ts,
                                sections: [section],
                            });
                        }
                    } else {
                        // Append a new section to the existing aggregate
                        // message and update it in place.
                        existing.sections.push(section);
                        await updateSlackMessage({
                            channelId: existing.channelId,
                            organizationUuid: prompt.organizationUuid,
                            ts: existing.messageTs,
                            text: 'SQL execution',
                            blocks: renderAggregateBlocks(existing),
                        });
                    }
                }

                if (slackAutoApproved) {
                    resolveSqlApproval(toolCallId, 'approved');
                }

                const decision = await decisionPromise;
                if (decision === 'rejected') {
                    await updateSection({ kind: 'rejected', sql });
                    return {
                        result: 'User rejected this SQL execution. Do not retry the same query; ask the user what they would like instead.',
                        metadata: { status: 'rejected' },
                    };
                }
                if (decision === 'timeout') {
                    await updateSection({ kind: 'timeout', sql });
                    return {
                        result: 'SQL approval timed out after 5 minutes with no response. The user may have stepped away — acknowledge politely and wait for them to re-ask.',
                        metadata: { status: 'timeout' },
                    };
                }

                await updateSection({ kind: 'running', sql });
                await updateProgress('Running SQL query...');

                const { rows, columns, rowCount } = await runSqlJob({
                    sql,
                    limit,
                });

                if (rowCount === 0) {
                    await updateSection({
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
                    {
                        header: true,
                        columns,
                    },
                );

                // For Slack: collapse the prior approval section into an
                // inline result preview. Only upload the full CSV file when
                // the result is large enough to justify a separate attachment.
                if (isSlack) {
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

                    await updateSection({
                        kind: 'success',
                        sql,
                        rowCount,
                        inlineCsv,
                        truncated: rowCount > SLACK_INLINE_ROW_LIMIT,
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
