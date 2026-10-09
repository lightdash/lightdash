import {
    getSqlApprovalSql,
    isSqlApprovalToolCall,
    isSqlChartContentArgs,
} from '@lightdash/common';
import {
    toolFailure,
    type ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import {
    createSqlApprovalGate,
    type SqlApprovalCall,
    type SqlApprovalCopy,
    type SqlApprovalDependencies,
} from './sqlApprovalGate';
import { SQL_CHART_REJECTED_RESULT, type ApproveSqlFn } from './sqlApprovals';

// Never (no SQL mode), after the thread approves the SQL, or straight away
// when the MCP client approves its own tool calls.
export type SqlChartSaving =
    | { mode: 'disabled' }
    | { mode: 'client_approved' }
    | { mode: 'thread_approval'; approval: SqlApprovalDependencies };

export const SQL_CHART_TIMEOUT_RESULT =
    'SQL approval timed out after 5 minutes with no response, so the SQL chart was not saved. The user may have stepped away — acknowledge politely and wait for them to re-ask.';

export const SQL_CHART_PREVIOUS_TIMEOUT_RESULT =
    'A previous SQL approval timed out in this response, so the SQL chart was not saved. Do not save SQL charts again in this response; tell the user the SQL was not approved and ask them to retry when ready.';

export const SQL_CHART_DISABLED_RESULT =
    'Saving SQL charts needs SQL mode, which is not enabled for this agent. Do not retry; build the chart from an explore instead, or ask an admin to enable SQL mode.';

export const SQL_CHART_APPROVAL_COPY: SqlApprovalCopy = {
    slackText: 'SQL chart approval',
    pendingProgress: 'Awaiting approval to save SQL chart...',
    approvedProgress: 'Saving SQL chart...',
    rejectedResult: SQL_CHART_REJECTED_RESULT,
    timeoutResult: SQL_CHART_TIMEOUT_RESULT,
    previousTimeoutResult: SQL_CHART_PREVIOUS_TIMEOUT_RESULT,
};

const getSqlChartApprovalHeading = (chartName: string) =>
    `Awaiting approval to save SQL chart "${chartName}"`;

/** The approval step a content tool hands the content service. */
const getSqlChartApproveSql =
    (call: SqlApprovalCall): ApproveSqlFn =>
    ({ sql, chartName, sqlChanged }) =>
        sqlChanged
            ? call.approveSql({
                  sql,
                  heading: getSqlChartApprovalHeading(chartName),
              })
            : call.settleUnchangedSql();

type SqlChartToolName = 'createContent' | 'editContent';

type ToolOutput = { result: string; metadata?: Record<string, unknown> };

/** The SQL chart gate the content tools share: refuses saves without SQL mode, approves gated calls. */
export const createSqlChartGate = (
    sqlChartSaving: SqlChartSaving,
    toolName: SqlChartToolName,
) => {
    const approvalGate =
        sqlChartSaving.mode === 'thread_approval'
            ? createSqlApprovalGate(
                  sqlChartSaving.approval,
                  toolName,
                  SQL_CHART_APPROVAL_COPY,
              )
            : null;

    /** The SQL a call asks to save; null when the call does not gate on it. */
    const getGatedSql = (args: unknown): string | null =>
        isSqlApprovalToolCall(toolName, args) ? getSqlApprovalSql(args) : null;

    /** For the AI SDK: a gated call on Slack suspends until the user decides. */
    const needsApproval = async (
        args: unknown,
        { toolCallId }: { toolCallId: string },
    ): Promise<boolean> =>
        approvalGate !== null &&
        approvalGate.needsNativeApproval({
            toolCallId,
            sql: getGatedSql(args),
        });

    // `approveSql` is null when the thread does not gate the call.
    const run = async <T extends ToolOutput>(
        { toolCallId, args }: { toolCallId: string; args: unknown },
        execute: (approveSql: ApproveSqlFn | null) => Promise<T>,
    ): Promise<T | ExecuteToolErrorResult> => {
        const isSqlChart = isSqlChartContentArgs(args);
        if (isSqlChart && sqlChartSaving.mode === 'disabled') {
            return toolFailure(SQL_CHART_DISABLED_RESULT);
        }
        const call =
            isSqlChart && approvalGate
                ? await approvalGate.forToolCall(toolCallId, {
                      sql: getGatedSql(args),
                  })
                : null;
        const output = await execute(call ? getSqlChartApproveSql(call) : null);
        return call ? call.persistIfResumed(output) : output;
    };

    return { needsApproval, run };
};
