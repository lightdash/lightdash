import { z } from 'zod';

export const schedulerSettingsSchema = z.object({
    timezone: z.string(),
    schedulerFailureNotifyRecipients: z.boolean(),
    schedulerFailureIncludeContact: z.boolean(),
    schedulerFailureContactOverride: z.string(),
});
