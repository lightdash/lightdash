export const sqlApprovalId = (toolCallId: string): string =>
    `sql-approval:${toolCallId}`;

type ApprovalRequestPart = {
    type: 'tool-approval-request';
    approvalId: string;
    signature: string | null;
    toolCall: {
        toolCallId: string;
        toolName: string;
        input?: unknown;
    };
};

type StepLike = {
    content?: ReadonlyArray<{ type?: string } | null> | null;
};

export type PendingToolApproval = {
    approvalId: string;
    signature: string | null;
    toolCallId: string;
    toolName: string;
    input: unknown;
};

const isApprovalRequestPart = (
    part: { type?: string } | null,
): part is ApprovalRequestPart => part?.type === 'tool-approval-request';

// Pulls pending tool-approval-requests out of a generateText result's steps.
// When non-empty, the run suspended awaiting approval rather than finishing.
export const extractPendingToolApprovals = (
    steps: ReadonlyArray<StepLike>,
): PendingToolApproval[] => {
    const pending: PendingToolApproval[] = [];
    for (const step of steps) {
        for (const part of step.content ?? []) {
            if (isApprovalRequestPart(part)) {
                pending.push({
                    approvalId: part.approvalId,
                    signature: part.signature ?? null,
                    toolCallId: part.toolCall.toolCallId,
                    toolName: part.toolCall.toolName,
                    input: part.toolCall.input,
                });
            }
        }
    }
    return pending;
};
