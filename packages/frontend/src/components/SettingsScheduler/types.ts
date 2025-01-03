import { z } from 'zod';

export const schedulerSettingsSchema = z.object({
    timezone: z.string(),
});
