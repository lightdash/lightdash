import { z } from 'zod';

export const slackFeedbackModalMetadataSchema = z.object({
    promptUuid: z.string(),
    slackChannelId: z.string().nullable().default(null),
    responseSlackTs: z.string().nullable().default(null),
    userUuid: z.string().nullable().default(null),
});
