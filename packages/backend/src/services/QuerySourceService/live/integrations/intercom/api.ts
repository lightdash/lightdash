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
        .array(
            z.object({
                code: z.string().optional(),
                message: z.string().nullable().optional(),
            }),
        )
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
            ...(parsed.data.errors ?? []).map(
                (error) => error.message || error.code,
            ),
        ]
            .filter(Boolean)
            .join(': ')
            // Our sentence goes on after it
            .replace(/[.!\s]+$/, '')
    );
};

/** Seconds until Intercom's window resets, from its Unix-time header. */
const readRetryAfter = (headers: Record<string, string>, now: number) => {
    const reset = Number(headers['x-ratelimit-reset']);
    if (Number.isFinite(reset) && reset > 0) {
        return Math.max(1, Math.ceil(reset - now / 1000));
    }
    const retryAfter = Number(headers['retry-after']);
    return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
};

/** Turns an Intercom error response into an error that says what to change. */
export const toIntercomError = (
    response: LiveHttpResponse,
    now = Date.now(),
): Error => {
    const message = readMessage(response.body);
    const detail = message ? `: ${message}` : '';
    if (response.status === 429) {
        const retryAfterSeconds = readRetryAfter(response.headers, now);
        return new TooManyRequestsError(
            `Intercom rate limit reached${detail}. Every private app in the workspace shares 10,000 calls a minute; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'shortly'
            }.`,
            { retryAfterSeconds },
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            `Intercom rejected the access token${detail}. Copy the access token from your app in Intercom's Developer Hub and update this live data source, and check its region matches your workspace.`,
        );
    }
    if (response.status === 403) {
        return new WarehouseConnectionError(
            `The Intercom access token can't read this${detail}. In the Developer Hub, give the app read permissions for conversations, tickets, contacts, admins and teams.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Intercom couldn't run this search${detail}. Check the filter values.`,
        );
    }
    return new UnexpectedServerError(
        `Intercom returned ${response.status}${detail}`,
    );
};
