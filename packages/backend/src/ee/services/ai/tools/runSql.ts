import {
    buildAgentRunSqlDescription,
    createToolRunSqlArgsSchema,
    isSlackPrompt,
    RUN_SQL_PREVIEW_ROW_LIMIT,
    runSqlToolDefinition,
    type AiSqlChartArtifactConfig,
    type AnyType,
    type ToolRunSqlOutput,
    type ToolRunSqlStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { type QueryReviewer } from '../decisions/queryReview';
import type {
    CreateOrUpdateArtifactFn,
    GetPromptFn,
    IsThreadSqlAutoApprovedFn,
    RecordSqlApprovalFn,
    RunSqlJobFn,
    SendFileFn,
    StoreToolResultsFn,
    UpdateProgressFn,
    UpdateSlackMessageFn,
    WaitForSqlApprovalFn,
} from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import {
    findSqlScopeViolations,
    formatSqlScopeError,
    type SqlScope,
} from '../utils/sqlScope';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { createSqlApprovalGate, type SqlApprovalCopy } from './sqlApprovalGate';
import {
    RUN_SQL_REJECTED_RESULT,
    SqlNotApprovedError,
    type TrackSqlApprovalTimeoutFn,
} from './sqlApprovals';

type Dependencies = {
    reviewQuery?: QueryReviewer;
    updateProgress: UpdateProgressFn;
    runSqlJob: RunSqlJobFn;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    updateSlackMessage: UpdateSlackMessageFn;
    siteUrl: string;
    waitForSqlApproval: WaitForSqlApprovalFn;
    recordSqlApproval: RecordSqlApprovalFn;
    isThreadSqlAutoApproved: IsThreadSqlAutoApprovedFn;
    trackSqlApprovalTimeout: TrackSqlApprovalTimeoutFn;
    storeToolResults: StoreToolResultsFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    maxQueryLimit: number;
    enableDataAccess: boolean;
    slackLinksOnly: boolean;
    sqlScope?: SqlScope | null;
    hyphenatedIdentifiers: boolean;
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
const FORBIDDEN_FUNCTIONS = /\b(query|query_table)\s*\(/i;
const INFORMATION_SCHEMA = /\binformation_schema\b/i;

const SLACK_INLINE_ROW_LIMIT = 10;

type SqlRow = Record<string, AnyType>;

const pickColumns = (rows: SqlRow[], columns: string[]): SqlRow[] =>
    rows.map((row) =>
        columns.reduce<SqlRow>((acc, col) => {
            acc[col] = row[col];
            return acc;
        }, {}),
    );

const toCsv = (rows: SqlRow[], columns: string[]) =>
    stringify(pickColumns(rows, columns), { header: true, columns });

const nonSuccessOutput = (
    result: string,
    status: 'error' | 'rejected' | 'timeout',
) => ({
    result,
    metadata: { status },
    structuredContent: { error: result },
});

const RUN_SQL_APPROVAL_HEADING = 'Awaiting approval to run SQL';

const RUN_SQL_APPROVAL_COPY: SqlApprovalCopy = {
    slackText: 'SQL execution',
    pendingProgress: 'Awaiting approval to run SQL...',
    // runSql reports its own progress once approved.
    approvedProgress: null,
    rejectedResult: RUN_SQL_REJECTED_RESULT,
    timeoutResult:
        'SQL approval timed out after 5 minutes with no response. The user may have stepped away — acknowledge politely and wait for them to re-ask.',
    previousTimeoutResult:
        'A previous SQL approval timed out in this response. Do not call runSql again in this response; tell the user the SQL was not approved and ask them to retry when ready.',
};

export const validateSelectOnly = (sql: string) => {
    const stripped = stripCommentsAndStrings(sql);
    if (!STARTS_WITH_SELECT_OR_WITH.test(stripped)) {
        throw new Error('Only SELECT or WITH queries are allowed.');
    }
    if (FORBIDDEN_STATEMENTS.test(stripped)) {
        throw new Error(
            'SQL contains forbidden statements (INSERT/UPDATE/DELETE/DDL). Only SELECT queries are allowed.',
        );
    }
    if (FORBIDDEN_FUNCTIONS.test(stripped)) {
        throw new Error(
            'SQL contains forbidden functions. Only direct SELECT queries are allowed.',
        );
    }
    if (INFORMATION_SCHEMA.test(stripped)) {
        throw new Error(
            'Querying information_schema is forbidden. Use describeWarehouseTable for column discovery on a raw table, or listWarehouseTables to find table names. If neither returns what you need, ask the user — do not introspect via SQL.',
        );
    }
};

export const getRunSql = ({
    reviewQuery,
    updateProgress,
    runSqlJob,
    getPrompt,
    updateSlackMessage,
    siteUrl,
    waitForSqlApproval,
    recordSqlApproval,
    isThreadSqlAutoApproved,
    trackSqlApprovalTimeout,
    storeToolResults,
    createOrUpdateArtifact,
    maxQueryLimit,
    enableDataAccess,
    sqlScope = null,
    hyphenatedIdentifiers,
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
    useSlackStreamCard = false,
}: Dependencies) => {
    const inputSchema = createToolRunSqlArgsSchema({
        maxLimit: maxQueryLimit,
    });

    const approvalGate = createSqlApprovalGate(
        {
            getPrompt,
            updateProgress,
            updateSlackMessage,
            siteUrl,
            waitForSqlApproval,
            recordSqlApproval,
            isThreadSqlAutoApproved,
            trackSqlApprovalTimeout,
            storeToolResults,
            autoApproveSql,
            autoApproveSqlUserUuid,
            useSlackStreamCard,
        },
        'runSql',
        RUN_SQL_APPROVAL_COPY,
    );

    return tool({
        description: buildAgentRunSqlDescription(500, maxQueryLimit),
        inputSchema,
        outputSchema: toolDefinition.outputSchema,
        toModelOutput: toolDefinition.toModelOutput,
        needsApproval: approvalGate.usesNativeApproval,
        execute: async ({ sql, limit }, { toolCallId }) => {
            const prompt = await getPrompt();
            const isSlack = isSlackPrompt(prompt);
            // Every return routes through persistIfResumed so a resumed call
            // always stores a result; otherwise the resumed request 400s.
            const { approveSql, renderState, persistIfResumed } =
                await approvalGate.forToolCall(toolCallId, {
                    needsApproval: true,
                });

            // Pre-section errors (bad SQL shape) — no Slack message exists
            // yet, just return the error to the agent.
            const scopeViolations = findSqlScopeViolations(sql, sqlScope, {
                hyphenatedIdentifiers,
            });
            if (scopeViolations.length > 0 && sqlScope) {
                return persistIfResumed(
                    nonSuccessOutput(
                        formatSqlScopeError(scopeViolations, sqlScope),
                        'error',
                    ),
                );
            }

            try {
                validateSelectOnly(sql);
            } catch (e) {
                return persistIfResumed(
                    toolErrorOutput(e, 'Error running SQL query.'),
                );
            }

            try {
                try {
                    await approveSql({
                        sql,
                        heading: RUN_SQL_APPROVAL_HEADING,
                    });
                } catch (e) {
                    if (e instanceof SqlNotApprovedError) {
                        return await persistIfResumed(
                            nonSuccessOutput(e.message, e.outcome),
                        );
                    }
                    throw e;
                }

                if (isSlack) {
                    await renderState({ kind: 'running', sql });
                } else {
                    await updateProgress('Running SQL query...');
                }

                const effectiveLimit = Math.min(limit, maxQueryLimit);
                const [{ rows, columns, rowCount }, review] = await Promise.all(
                    [
                        runSqlJob({ sql, limit: effectiveLimit }),
                        enableDataAccess
                            ? (reviewQuery?.({
                                  kind: 'sql',
                                  sql,
                                  limit: effectiveLimit,
                              }) ?? '')
                            : '',
                    ],
                );

                if (!isSlack) {
                    await createOrUpdateArtifact({
                        threadUuid: prompt.threadUuid,
                        promptUuid: prompt.promptUuid,
                        artifactType: 'chart',
                        title: 'SQL query results',
                        vizConfig: {
                            source: 'sql',
                            sql,
                            limit: effectiveLimit,
                        } satisfies AiSqlChartArtifactConfig,
                    });
                }

                if (rowCount === 0) {
                    await renderState({
                        kind: 'success',
                        sql,
                        rowCount: 0,
                        inlineCsv: '',
                        truncated: false,
                    });
                    const emptyReview =
                        enableDataAccess && reviewQuery
                            ? await reviewQuery(
                                  { kind: 'sql', sql, limit: effectiveLimit },
                                  { emptyResult: true, review },
                              )
                            : null;
                    const emptyContent: ToolRunSqlStructuredContent = {
                        rowCount: 0,
                        columns,
                        rows: [],
                        truncated: false,
                        review: emptyReview,
                    };
                    return await persistIfResumed({
                        result: `Query returned 0 rows.${
                            columns.length > 0
                                ? ` Columns: ${columns.join(', ')}`
                                : ''
                        }${emptyReview !== null ? ` ${emptyReview}` : ''}`,
                        metadata: { status: 'success', rowCount: 0 },
                        structuredContent: emptyContent,
                    });
                }

                if (isSlack) {
                    const inlineCsv = toCsv(
                        rows.slice(0, SLACK_INLINE_ROW_LIMIT),
                        columns,
                    );

                    await renderState({
                        kind: 'success',
                        sql,
                        rowCount,
                        inlineCsv,
                        truncated: rowCount > SLACK_INLINE_ROW_LIMIT,
                    });
                }

                const resultSummary = `${rowCount} rows. Columns: ${columns.join(
                    ', ',
                )}.`;

                if (!enableDataAccess) {
                    const summaryContent: ToolRunSqlStructuredContent = {
                        rowCount,
                        columns,
                        rows: null,
                        truncated: false,
                        review: null,
                    };
                    return await persistIfResumed({
                        result: resultSummary,
                        metadata: { status: 'success', rowCount },
                        structuredContent: summaryContent,
                    });
                }

                const previewRows = pickColumns(
                    rows.slice(0, RUN_SQL_PREVIEW_ROW_LIMIT),
                    columns,
                );
                const previewContent: ToolRunSqlStructuredContent = {
                    rowCount,
                    columns,
                    rows: previewRows,
                    truncated: rowCount > RUN_SQL_PREVIEW_ROW_LIMIT,
                    review: review || null,
                };
                const previewCsv = stringify(previewRows, {
                    header: true,
                    columns,
                });

                const truncatedNote = previewContent.truncated
                    ? `\n(Showing first ${RUN_SQL_PREVIEW_ROW_LIMIT} of ${rowCount} rows.)`
                    : '';

                return await persistIfResumed({
                    result: `${resultSummary}${truncatedNote}\n${serializeData(
                        previewCsv,
                        'csv',
                    )}${review}`,
                    metadata: { status: 'success', rowCount },
                    structuredContent: previewContent,
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
                return persistIfResumed(
                    toolErrorOutput(e, 'Error running SQL query.'),
                );
            }
        },
    });
};
