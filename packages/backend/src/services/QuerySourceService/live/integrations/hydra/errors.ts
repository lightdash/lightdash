import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { parseRetryAfterSeconds } from '../../calls';
import { type LiveHttpResponse } from '../../types';

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
    if (response.status === 429 || body.code === 'rate_limited') {
        // Seconds or an HTTP date, as vendors send either
        const retryAfterSeconds = parseRetryAfterSeconds(
            response.headers['retry-after'],
            now,
        );
        return new TooManyRequestsError(
            `Hydra rate limit reached${detail}. Retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'shortly'
            }, or loosen the source's vendorLimits or script.`,
            { retryAfterSeconds },
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            `Hydra rejected the sign-in token${detail}. Turn off failAuth in the source's behaviour, or set a token.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Hydra couldn't run this report${detail}.`,
        );
    }
    return new UnexpectedServerError(
        `Hydra returned ${response.status}${detail}`,
    );
};
