import { EventEmitter } from 'events';

const bus = new EventEmitter();
bus.setMaxListeners(100);

// Threads (Lightdash AI thread UUIDs) where the user clicked "Approve & don't
// ask again" from a Slack approval message. Subsequent runSql calls in the
// same thread skip the approval flow. In-memory, session-scoped — lost on
// pod restart, same as the approval bus itself.
const slackAutoApprovedThreads = new Set<string>();

export type SqlApprovalDecision = 'approved' | 'rejected' | 'timeout';

export const markSlackThreadAutoApproved = (threadUuid: string): void => {
    slackAutoApprovedThreads.add(threadUuid);
};

export const isSlackThreadAutoApproved = (threadUuid: string): boolean =>
    slackAutoApprovedThreads.has(threadUuid);

export const waitForSqlApproval = (
    toolCallId: string,
    timeoutMs: number = 5 * 60 * 1000,
): Promise<SqlApprovalDecision> =>
    new Promise((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;
        const onDecision = (decision: SqlApprovalDecision) => {
            if (settled) return;
            settled = true;
            bus.off(toolCallId, onDecision);
            clearTimeout(timer);
            resolve(decision);
        };
        bus.on(toolCallId, onDecision);
        timer = setTimeout(() => onDecision('timeout'), timeoutMs);
    });

export const resolveSqlApproval = (
    toolCallId: string,
    decision: SqlApprovalDecision,
): boolean => bus.emit(toolCallId, decision);
