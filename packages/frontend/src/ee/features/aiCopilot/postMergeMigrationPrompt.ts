/**
 * Sent into the thread automatically when a writeback PR is merged from the chat
 * PR card. It is injected as a HIDDEN turn (the prompt is marked `hidden`, so the
 * agent receives and responds to it but the UI never renders the user bubble) —
 * only the agent's proactive reply is shown.
 */
export const POST_MERGE_MIGRATION_PROMPT = [
    "This is a hidden prompt — the user you're chatting with cannot see it, but your reply to it will be shown to them.",
    'The pull request has just been merged, so its dbt/semantic-layer changes are now live.',
    'Your job in response to this message is one of two things:',
    '1. If existing saved content is affected by the change, present the user with a concise plan to migrate the impacted charts, dashboards, metrics and scheduled deliveries to the new semantic layer. Use analyzeFieldImpact on any removed or renamed field to ground the plan in the exact affected content.',
    "2. If no changes are required (e.g. the edit was a description, or added a new field), simply tell the user that there's nothing to update post-merge and everything should be working as expected.",
    'Write your reply directly to the user — do not mention that you received a hidden prompt.',
].join('\n');
