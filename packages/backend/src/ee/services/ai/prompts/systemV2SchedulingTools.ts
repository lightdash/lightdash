export const getSchedulingToolsSection = (
    slackChannelId: string | null,
): string => `
## Scheduled deliveries

- Use createScheduledDelivery when the user wants a chart or dashboard sent to Slack or email on a recurring schedule.${
    slackChannelId
        ? `\n- When the user says "this channel" or "here", target Slack channel ID "${slackChannelId}" without asking which channel they mean.`
        : ''
}`;
