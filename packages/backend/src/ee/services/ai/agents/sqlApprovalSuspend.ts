// Native AI-SDK human-in-the-loop for SQL approval. runSql declares
// `needsApproval` on the modern Slack path: the SDK halts before executing and
// emits a `tool-approval-request`, ending the run so the worker can be released.
// A resume job rebuilds history with a matching `tool-approval-response` and the
// SDK executes runSql itself.
//
// Because we reconstruct the message history ourselves, the approvalId is
// derived deterministically from the toolCallId — request and response always
// match without persisting the SDK's original id.

export const sqlApprovalId = (toolCallId: string): string =>
    `sql-approval:${toolCallId}`;

type ApprovalRequestPart = {
    type: 'tool-approval-request';
    approvalId: string;
    toolCall: {
        toolCallId: string;
        toolName: string;
        input?: unknown;
    };
};

type StepLike = {
    content?: ReadonlyArray<{ type?: string } | null> | null;
};

export type PendingSqlApproval = {
    approvalId: string;
    toolCallId: string;
    toolName: string;
    input: unknown;
};

const isApprovalRequestPart = (
    part: { type?: string } | null,
): part is ApprovalRequestPart => part?.type === 'tool-approval-request';

// Pulls pending tool-approval-requests out of a generateText result's steps.
// When non-empty, the run suspended awaiting approval rather than finishing.
export const extractPendingSqlApprovals = (
    steps: ReadonlyArray<StepLike>,
): PendingSqlApproval[] => {
    const pending: PendingSqlApproval[] = [];
    for (const step of steps) {
        for (const part of step.content ?? []) {
            if (isApprovalRequestPart(part)) {
                pending.push({
                    approvalId: part.approvalId,
                    toolCallId: part.toolCall.toolCallId,
                    toolName: part.toolCall.toolName,
                    input: part.toolCall.input,
                });
            }
        }
    }
    return pending;
};
