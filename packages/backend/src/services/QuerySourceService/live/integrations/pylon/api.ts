import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

const errorSchema = z.object({
    message: z.string().optional(),
    errors: z
        .array(z.union([z.string(), z.object({ message: z.string() })]))
        .optional(),
});

const readMessage = (body: unknown) => {
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success) {
        return typeof body === 'string' ? body.slice(0, 300) : '';
    }
    return (
        [
            parsed.data.message,
            ...(parsed.data.errors ?? []).map((error) =>
                typeof error === 'string' ? error : error.message,
            ),
        ]
            .filter(Boolean)
            .join(': ')
            // Our sentence goes on after it
            .replace(/[.!\s]+$/, '')
    );
};

/** Turns a Pylon error response into an error that says what to change. */
export const toPylonError = (response: LiveHttpResponse): Error => {
    const message = readMessage(response.body);
    const detail = message ? `: ${message}` : '';
    if (response.status === 429) {
        const retryAfter = Number(response.headers['retry-after']);
        const retryAfterSeconds =
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
        return new TooManyRequestsError(
            `Pylon rate limit reached${detail}. Search allows about 120 calls a minute per workspace; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'shortly'
            }.`,
            { retryAfterSeconds },
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            `Pylon rejected the API token${detail}. Ask a Pylon admin for a new token and update this live data source.`,
        );
    }
    if (response.status === 403) {
        return new WarehouseConnectionError(
            `The Pylon API token can't read this${detail}. Pylon API tokens are created by admins in Settings, API Tokens.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Pylon couldn't run this search${detail}. Check the filter values.`,
        );
    }
    return new UnexpectedServerError(
        `Pylon returned ${response.status}${detail}`,
    );
};
