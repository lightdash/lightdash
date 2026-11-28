import {
    getSqlApprovalSql,
    isComposerChartContentArgs,
    isSqlApprovalToolCall,
    isSqlChartContentArgs,
    ParameterError,
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
import {
    SQL_CHART_REJECTED_RESULT,
    SqlNotApprovedError,
    toSqlApprovalRequest,
    type ApproveSqlFn,
    type SqlApprovalRequest,
} from './sqlApprovals';

// Never (no SQL mode), after the thread approves the SQL, or straight away
// when the MCP client approves its own tool calls.
export type SqlChartSaving = {
    recordRefusal?: (
        action: 'create' | 'update',
        reasonCode: string,
    ) => Promise<void>;
} & (
    | { mode: 'disabled' }
    | { mode: 'client_approved' }
    | { mode: 'thread_approval'; approval: SqlApprovalDependencies }
);

export const SQL_CHART_TIMEOUT_RESULT =
    'SQL approval timed out after 5 minutes with no response, so the SQL chart was not saved. The user may have stepped away — acknowledge politely and wait for them to re-ask.';

export const SQL_CHART_PREVIOUS_TIMEOUT_RESULT =
    'A previous SQL approval timed out in this response, so the SQL chart was not saved. Do not save SQL charts again in this response; tell the user the SQL was not approved and ask them to retry when ready.';

export const SQL_CHART_DISABLED_RESULT =
    'Saving SQL charts needs SQL mode, which is not enabled for this agent. Do not retry; build the chart from an explore instead, or ask an admin to enable SQL mode.';

export const COMPOSER_CHART_SQL_UNASKED_RESULT =
    'The composer chart edit was not saved: its new SQL could not be checked for approval before running. Try the edit again.';

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
    ({ sql, nodeSql, chartName, sqlChanged }) =>
        sqlChanged
            ? call.approveSql({
                  sql,
                  nodeSql,
                  heading: getSqlChartApprovalHeading(chartName),
                  steps: null,
              })
            : call.settleUnchangedSql();

type SqlChartToolName = 'createContent' | 'editContent';

export type GetComposerChartSqlFn = (
    args: unknown,
) => Promise<SqlApprovalRequest | null>;

type ToolOutput = { result: string; metadata?: Record<string, unknown> };

/** The SQL chart gate the content tools share: refuses saves without SQL mode, approves gated calls. */
export const createSqlChartGate = (
    sqlChartSaving: SqlChartSaving,
    toolName: SqlChartToolName,
    // The SQL a composer chart call saves: an edit's depends on the stored chart, so the server works it out.
    getComposerChartSql: GetComposerChartSqlFn | null = null,
) => {
    const approvalGate =
        sqlChartSaving.mode === 'thread_approval'
            ? createSqlApprovalGate(
                  sqlChartSaving.approval,
                  toolName,
                  SQL_CHART_APPROVAL_COPY,
              )
            : null;

    // What needsApproval found for each composer edit, so execution cannot save SQL it never asked about.
    const askedComposerSql = new Map<
        string,
        SqlApprovalRequest | null | 'failed'
    >();

    /** The SQL a call asks to save; null when the call does not gate on it. */
    const getGatedSql = async (
        args: unknown,
    ): Promise<SqlApprovalRequest | null> => {
        if (isComposerChartContentArgs(args)) {
            return getComposerChartSql ? getComposerChartSql(args) : null;
        }
        return isSqlApprovalToolCall(toolName, args)
            ? toSqlApprovalRequest(getSqlApprovalSql(args))
            : null;
    };

    /** For the AI SDK: a gated call on Slack suspends until the user decides. */
    const needsApproval = async (
        args: unknown,
        { toolCallId }: { toolCallId: string },
    ): Promise<boolean> => {
        if (approvalGate === null) return false;
        if (!isComposerChartContentArgs(args)) {
            return approvalGate.needsNativeApproval({
                toolCallId,
                request: await getGatedSql(args),
            });
        }
        // A refused edit asks nothing; running it reports the refusal.
        const request = await getGatedSql(args).catch(() => 'failed' as const);
        askedComposerSql.set(toolCallId, request);
        return (
            request !== 'failed' &&
            approvalGate.needsNativeApproval({ toolCallId, request })
        );
    };

    // `approveSql` is null when the thread does not gate the call.
    const run = async <T extends ToolOutput>(
        { toolCallId, args }: { toolCallId: string; args: unknown },
        execute: (approveSql: ApproveSqlFn | null) => Promise<T>,
    ): Promise<T | ExecuteToolErrorResult> => {
        const isSqlChart = isSqlChartContentArgs(args);
        if (isSqlChart && sqlChartSaving.mode === 'disabled') {
            await sqlChartSaving.recordRefusal?.(
                toolName === 'createContent' ? 'create' : 'update',
                'sql_mode_disabled',
            );
            return toolFailure(SQL_CHART_DISABLED_RESULT);
        }
        const recorded = new WeakSet<SqlNotApprovedError>();
        const recordRefusal = async (error: unknown) => {
            if (!(error instanceof SqlNotApprovedError) || recorded.has(error))
                return;
            recorded.add(error);
            await sqlChartSaving.recordRefusal?.(
                toolName === 'createContent' ? 'create' : 'update',
                error.outcome === 'rejected'
                    ? 'sql_approval_rejected'
                    : 'sql_approval_timeout',
            );
        };
        try {
            const isComposerChart = isComposerChartContentArgs(args);
            const askedSql = askedComposerSql.get(toolCallId);
            askedComposerSql.delete(toolCallId);
            // For a composer chart, the service asks only for warehouse SQL the call adds.
            const call =
                (isSqlChart || isComposerChart) && approvalGate
                    ? await approvalGate.forToolCall(toolCallId, {
                          // A refused edit saves nothing; running it reports the refusal.
                          request: await getGatedSql(args).catch(() => null),
                      })
                    : null;
            const approveSql = call ? getSqlChartApproveSql(call) : null;
            const output = await execute(
                approveSql
                    ? async (request) => {
                          // Never save composer SQL the approval check did not see.
                          if (
                              isComposerChart &&
                              askedSql !== undefined &&
                              (askedSql === null ||
                                  askedSql === 'failed' ||
                                  askedSql.sql !== request.sql)
                          ) {
                              throw new ParameterError(
                                  COMPOSER_CHART_SQL_UNASKED_RESULT,
                              );
                          }
                          try {
                              await approveSql(request);
                          } catch (error) {
                              await recordRefusal(error);
                              throw error;
                          }
                      }
                    : null,
            );
            return call ? await call.persistIfResumed(output) : output;
        } catch (error) {
            await recordRefusal(error);
            throw error;
        }
    };

    return { needsApproval, run };
};
