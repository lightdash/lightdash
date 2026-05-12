import { EventEmitter } from 'events';

const bus = new EventEmitter();
bus.setMaxListeners(100);

export type SqlApprovalDecision = 'approved' | 'rejected' | 'timeout';

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
