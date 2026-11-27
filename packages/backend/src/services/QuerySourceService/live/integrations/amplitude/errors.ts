import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

// Amplitude's error bodies differ by endpoint: plain text, an `error` object
// whose `metadata.details` names the problem, or JSON with an `error` string
// or a `message`.
const errorSchema = z.union([
    z.string(),
    z
        .object({
            error: z.object({
                message: z.string(),
                metadata: z.object({ details: z.string() }).optional(),
            }),
        })
        .transform(({ error }) => error.metadata?.details ?? error.message),
    z.object({ error: z.string() }).transform(({ error }) => error),
    z.object({ message: z.string() }).transform(({ message }) => message),
]);

const MAX_DETAIL_LENGTH = 300;

const getDetail = (body: unknown) => {
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success) return '';
    const message = parsed.data
        .trim()
        .replace(/[.!]+$/, '')
        .slice(0, MAX_DETAIL_LENGTH);
    // An HTML error page says nothing useful
    return message && !message.startsWith('<') ? `: ${message}` : '';
};

/** Seconds until Amplitude accepts calls again, when it says. */
const getRetryAfterSeconds = (headers: Record<string, string>) => {
    const seconds = Number(headers['retry-after']);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
};

/** Turns a Dashboard API error into an error that says what to change. */
export const toAmplitudeError = (response: LiveHttpResponse): Error => {
    const detail = getDetail(response.body);
    if (response.status === 429) {
        const retryAfterSeconds = getRetryAfterSeconds(response.headers);
        return new TooManyRequestsError(
            `Amplitude rate limit reached${detail}. Amplitude allows 5 queries at once per project and limits their cost per hour; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'in a few minutes'
            }, or shorten the date range.`,
            { retryAfterSeconds },
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            `Amplitude rejected the API key and secret key${detail}. Copy both from the project's settings in Amplitude and update this live data source.`,
        );
    }
    if (response.status === 403) {
        return new WarehouseConnectionError(
            `Amplitude denied access${detail}. Check that the API key and secret key belong to the same project, and that the source's data region (US or EU) is the project's.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Amplitude rejected the request${detail}.`,
        );
    }
    return new UnexpectedServerError(
        `Amplitude returned ${response.status}${detail}.`,
    );
};
