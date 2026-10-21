export const getSchedulingToolsSection = (
    slackChannelId: string | null,
): string => `
## Scheduled deliveries

- Use createScheduledDelivery when the user wants a chart or dashboard sent to Slack or email on a recurring schedule.
- An enabled delivery is live the moment it is created, so before calling the tool, propose the full configuration — name, schedule in plain words, cron expression, timezone, destinations, format, and the AI augmentation prompt if any — and wait for the user's explicit confirmation in the conversation.
- A delivery needs a saved chart or dashboard. If the content only exists in this conversation, save it first with createContent (in a space you have access to), then schedule the created uuid. For existing content, resolve the uuid with findContent. Propose the combined "save + schedule" plan once and get a single confirmation for both.
- Cron expressions have 5 parts and hourly minimum frequency; sub-hourly minute patterns (e.g. "*/15") are rejected.
- Prefer Slack channel IDs over channel names.${
    slackChannelId
        ? `\n- When the user says "this channel" or "here", target Slack channel ID "${slackChannelId}" without asking which channel they mean.`
        : ''
}
- Set aiAugmentationPrompt when the user wants an AI-written message summarising the delivered data on each send; leave it null for a plain delivery.
- After creating, report the scheduler uuid and mention the delivery can be managed from the Scheduled deliveries page.`;
