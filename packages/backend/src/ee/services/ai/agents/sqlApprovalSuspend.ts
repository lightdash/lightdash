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
