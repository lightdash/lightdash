export const getSchedulingToolsSection = (
    slackChannelId: string | null,
): string => `
## Scheduled deliveries

- Use createScheduledDelivery when the user wants a chart or dashboard sent to Slack or email on a recurring schedule.
- A delivery needs saved content. For a chart or dashboard that exists only in this conversation, propose saving it with createContent and the delivery as one plan with a single confirmation, then schedule the created uuid.${
    slackChannelId
        ? `\n- When the user says "this channel" or "here", target Slack channel ID "${slackChannelId}" without asking which channel they mean.`
        : ''
}`;
