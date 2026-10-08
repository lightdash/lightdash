import { isSlackPrompt } from '@lightdash/common';
import type {
    GetPromptFn,
    IsThreadSqlAutoApprovedFn,
    RecordSqlApprovalFn,
    StoreToolResultsFn,
    UpdateProgressFn,
    UpdateSlackMessageFn,
    WaitForSqlApprovalFn,
} from '../types/aiAgentDependencies';
import { renderBlocks } from './slackSqlAggregate';
import {
    SqlNotApprovedError,
    type ApproveSqlFn,
    type SqlApprovalToolName,
    type TrackSqlApprovalTimeoutFn,
} from './sqlApprovals';

export type SqlChartApprovalDependencies = {
    getPrompt: GetPromptFn;
    updateProgress: UpdateProgressFn;
    updateSlackMessage: UpdateSlackMessageFn;
    siteUrl: string;
    waitForSqlApproval: WaitForSqlApprovalFn;
    recordSqlApproval: RecordSqlApprovalFn;
    isThreadSqlAutoApproved: IsThreadSqlAutoApprovedFn;
    trackSqlApprovalTimeout: TrackSqlApprovalTimeoutFn;
    // Persists results of resumed calls, which onStepFinish never sees.
    storeToolResults: StoreToolResultsFn;
    autoApproveSql: boolean;
    autoApproveSqlUserUuid: string | null;
    useSlackStreamCard: boolean;
};

/**
 * How a content tool may save a SQL chart: never (no SQL mode), after the
 * thread approves its SQL (agent threads), or straight away when the MCP
 * client approves its own tool calls.
 */
export type SqlChartSaving =
    | { mode: 'disabled' }
    | { mode: 'client_approved' }
    | { mode: 'thread_approval'; approval: SqlChartApprovalDependencies };

export const SQL_CHART_REJECTED_RESULT =
    'User rejected the SQL for this SQL chart, so nothing was saved. Do not retry the same SQL; ask the user what they would like instead.';

export const SQL_CHART_TIMEOUT_RESULT =
    'SQL approval timed out after 5 minutes with no response, so the SQL chart was not saved. The user may have stepped away — acknowledge politely and wait for them to re-ask.';

export const SQL_CHART_PREVIOUS_TIMEOUT_RESULT =
    'A previous SQL approval timed out in this response, so the SQL chart was not saved. Do not save SQL charts again in this response; tell the user the SQL was not approved and ask them to retry when ready.';

export const SQL_CHART_DISABLED_RESULT =
    'Saving SQL charts needs SQL mode, which is not enabled for this agent. Do not retry; build the chart from an explore instead, or ask an admin to enable SQL mode.';

/** One per tool instance: approval state spans the calls of a response. */
export const createSqlChartApprovalGate = (
    approval: SqlChartApprovalDependencies,
    toolName: SqlApprovalToolName,
) => {
    let timedOut = false;

    const isThreadAutoApproved = async (threadUuid: string) =>
        approval.autoApproveSql || approval.isThreadSqlAutoApproved(threadUuid);

    // Modern Slack cards use the AI SDK's native approval: the run suspends
    // on the tool call and resumes once the user decides.
    const usesNativeApproval = async (): Promise<boolean> => {
        if (!approval.useSlackStreamCard || approval.autoApproveSql) {
            return false;
        }
        const prompt = await approval.getPrompt();
        return (
            isSlackPrompt(prompt) &&
            !(await approval.isThreadSqlAutoApproved(prompt.threadUuid))
        );
    };

    /**
     * Builds the approval step for one tool call. `isResume()` reports whether
     * the call resumes an approval recorded in an earlier run, in which case
     * the caller must persist the tool result itself.
     */
    const forToolCall = ({
        toolCallId,
        sql,
        chartName,
    }: {
        toolCallId: string;
        sql: string;
        chartName: string;
    }) => {
        let resume = false;
        const approveSql: ApproveSqlFn = async () => {
            if (timedOut) {
                throw new SqlNotApprovedError(
                    'timeout',
                    SQL_CHART_PREVIOUS_TIMEOUT_RESULT,
                );
            }
            const prompt = await approval.getPrompt();
            const isSlack = isSlackPrompt(prompt);

            if (await isThreadAutoApproved(prompt.threadUuid)) {
                const recorded = await approval.recordSqlApproval({
                    toolCallId,
                    toolName,
                    decidedByUserUuid: approval.autoApproveSql
                        ? approval.autoApproveSqlUserUuid
                        : null,
                    source: approval.autoApproveSql
                        ? 'auto_approve'
                        : 'thread_auto_approve',
                });
                resume = !recorded;
                return;
            }

            if (await usesNativeApproval()) {
                // The SDK only executes this call once the user approved it.
                resume = true;
                return;
            }

            const renderSlack = async (
                state: Parameters<typeof renderBlocks>[0],
            ) => {
                if (!isSlack) return;
                await approval.updateSlackMessage({
                    channelId: prompt.slackChannelId,
                    organizationUuid: prompt.organizationUuid,
                    ts: prompt.response_slack_ts,
                    text: 'SQL chart approval',
                    blocks: renderBlocks(state, approval.siteUrl),
                });
            };

            if (isSlack) {
                await renderSlack({
                    kind: 'pending',
                    sql,
                    toolCallId,
                    threadUuid: prompt.threadUuid,
                    heading: `Awaiting approval to save SQL chart "${chartName}"`,
                });
            } else {
                await approval.updateProgress(
                    'Awaiting approval to save SQL chart...',
                );
            }

            const decision = await approval.waitForSqlApproval(toolCallId);
            if (decision === 'rejected') {
                await renderSlack({ kind: 'rejected', sql });
                throw new SqlNotApprovedError(
                    'rejected',
                    SQL_CHART_REJECTED_RESULT,
                );
            }
            if (decision === 'timeout') {
                timedOut = true;
                approval.trackSqlApprovalTimeout({
                    toolCallId,
                    toolName,
                    promptedUserUuid: prompt.createdByUserUuid,
                    source: isSlack ? 'slack' : 'web',
                });
                await renderSlack({ kind: 'timeout', sql });
                throw new SqlNotApprovedError(
                    'timeout',
                    SQL_CHART_TIMEOUT_RESULT,
                );
            }
            await approval.updateProgress('Saving SQL chart...');
        };

        return { approveSql, isResume: () => resume };
    };

    return { usesNativeApproval, forToolCall };
};
