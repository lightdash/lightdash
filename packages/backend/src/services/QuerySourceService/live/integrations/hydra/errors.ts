import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../types';

const errorSchema = z.object({ message: z.string() });

/** Turns a Hydra error response into an error that says what to change. */
export const toHydraError = (response: LiveHttpResponse): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const detail = parsed.success ? `: ${parsed.data.message}` : '';
    if (response.status === 429) {
        const retryAfter = Number(response.headers['retry-after']);
        const retryAfterSeconds =
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
        return new TooManyRequestsError(
            `Hydra rate limit reached${detail}. Retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'shortly'
            }, or raise retryAfterEvery in the source's behaviour.`,
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
