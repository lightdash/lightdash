import { z } from 'zod';

const snowflakeReauthenticationOutputSchema = z.object({
    metadata: z.object({
        status: z.literal('error'),
        requiresSnowflakeReauthentication: z.literal(true),
    }),
});

export const requiresSnowflakeReauthentication = (output: unknown): boolean =>
    snowflakeReauthenticationOutputSchema.safeParse(output).success;
