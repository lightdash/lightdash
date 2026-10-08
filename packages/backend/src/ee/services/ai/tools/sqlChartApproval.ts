import {
    type SqlApprovalCopy,
    type SqlApprovalDependencies,
} from './sqlApprovalGate';
import { SQL_CHART_REJECTED_RESULT } from './sqlApprovals';

/**
 * How a content tool may save a SQL chart: never (no SQL mode), after the
 * thread approves its SQL (agent threads), or straight away when the MCP
 * client approves its own tool calls.
 */
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

export const getSqlChartApprovalHeading = (chartName: string) =>
    `Awaiting approval to save SQL chart "${chartName}"`;
