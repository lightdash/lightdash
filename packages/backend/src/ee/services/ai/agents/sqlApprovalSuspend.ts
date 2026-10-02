// Native AI-SDK human-in-the-loop. A tool that declares `needsApproval`
// (runSql on the modern Slack path, generateUi on the web) halts the run on a
// `tool-approval-request`. The resume rebuilds history with a matching
// `tool-approval-response` and the SDK executes the tool itself.
//
// Because we reconstruct the message history ourselves, the approvalId is
// derived deterministically from the toolCallId — request and response always
// match without persisting the SDK's original id. The `sql-approval` prefix is
// historical; the id serves every tool that waits this way.

export const sqlApprovalId = (toolCallId: string): string =>
    `sql-approval:${toolCallId}`;
