import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { type z } from 'zod';
import { parseRetryAfterSeconds } from '../calls';
import { type LiveHttpResponse, type LiveTestSummary } from '../types';

/** What an integration says for each kind of failed call. */
export type LiveHttpErrorMessages = {
    /** 429, given the whole seconds the API asked to wait, when it said. */
    rateLimited: (retryAfterSeconds: number | null) => string;
    /** Statuses the admin fixes in the connection (401, 403...), as connection errors. */
    connection?: Partial<Record<number, string>>;
    /** Any other 4xx, as a query error. */
    rejected: string;
    /** Anything else, as a server error. */
    failed: string;
};

/**
 * Turns a non-2xx response into the error people see: 429 is a rate limit
 * carrying `retryAfterSeconds`, `connection` statuses need the source fixed,
 * other 4xx are the query's fault and the rest are the API's.
 */
export const toLiveHttpError = (
    response: Pick<LiveHttpResponse, 'status' | 'headers'>,
    messages: LiveHttpErrorMessages,
    now = new Date(),
): Error => {
    const { status } = response;
    if (status === 429) {
        const header = response.headers['retry-after']?.trim();
        // Some APIs send fractional seconds, which an HTTP-date parse misreads
        const seconds =
            header && /^\d+(\.\d+)?$/.test(header)
                ? Number(header)
                : parseRetryAfterSeconds(header, now);
        const retryAfterSeconds =
            seconds !== null && seconds > 0 ? Math.ceil(seconds) : null;
        return new TooManyRequestsError(
            messages.rateLimited(retryAfterSeconds),
            { retryAfterSeconds },
        );
    }
    const connection = messages.connection?.[status];
    if (connection !== undefined) {
        return new WarehouseConnectionError(connection);
    }
    if (status >= 400 && status < 500) {
        return new WarehouseQueryError(messages.rejected);
    }
    return new UnexpectedServerError(messages.failed);
};

/** A `summarizeTest` that reads the test response with `schema`, or gives null when it doesn't match. */
export const summarizeTestWith =
    <T>(schema: z.ZodType<T>, summarize: (body: T) => LiveTestSummary) =>
    (body: unknown): LiveTestSummary | null => {
        const parsed = schema.safeParse(body);
        return parsed.success ? summarize(parsed.data) : null;
    };
