import { z } from 'zod';
import { toLiveHttpError, type LiveHttpResponse } from '../../sdk';

const errorSchema = z.object({
    message: z.string().optional(),
    // Marks a throttle answered with another status, as some vendors do
    code: z.string().optional(),
});

/** Turns a Hydra error response into an error that says what to change. */
export const toHydraError = (
    response: LiveHttpResponse,
    now: Date = new Date(),
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const body = parsed.success ? parsed.data : {};
    const detail = body.message ? `: ${body.message}` : '';
    return toLiveHttpError(
        body.code === 'rate_limited' ? { ...response, status: 429 } : response,
        {
            rateLimited: (seconds) =>
                `Hydra rate limit reached${detail}. Retry ${
                    seconds ? `in ${seconds} seconds` : 'shortly'
                }, or loosen the source's vendorLimits or mockResponses.`,
            connection: {
                401: `Hydra rejected the sign-in token${detail}. Turn off failAuth in the source's behaviour, or set a token.`,
            },
            rejected: `Hydra couldn't run this report${detail}.`,
            failed: `Hydra returned ${response.status}${detail}`,
        },
        now,
    );
};
