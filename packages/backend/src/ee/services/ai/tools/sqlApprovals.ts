import { type AiSqlApprovalDecision } from '../../../database/entities/ai';

// ---------------------------------------------------------------------------
// SQL approval — in-memory UX flag for Slack "approve & don't ask again"
//
// The decision itself (approved / rejected) is persisted in the
// `ai_sql_approval` table via `AiAgentModel.waitForSqlApproval` /
// `recordSqlApproval`. That part is the one that has to survive pod
// restarts / cross-pod requests.
//
// What's left here is session-scoped UX state: when the user clicks
// "Approve & don't ask again" from a Slack approval message, we remember
// that thread for the lifetime of this pod so subsequent runSql calls in
// the same thread skip the approval flow. It's a UX nicety, not a
// correctness primitive, so the in-memory Set is fine.
// ---------------------------------------------------------------------------

const slackAutoApprovedThreads = new Set<string>();

export type SqlApprovalDecision = AiSqlApprovalDecision | 'timeout';

export const markSlackThreadAutoApproved = (threadUuid: string): void => {
    slackAutoApprovedThreads.add(threadUuid);
};

export const isSlackThreadAutoApproved = (threadUuid: string): boolean =>
    slackAutoApprovedThreads.has(threadUuid);
