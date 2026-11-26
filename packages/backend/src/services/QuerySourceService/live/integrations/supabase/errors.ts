import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../types';

/** PostgREST's error body; Supabase's gateway sends only `message`. */
const errorSchema = z.object({
    code: z.string().nullable().optional(),
    message: z.string().optional(),
    details: z.string().nullable().optional(),
    hint: z.string().nullable().optional(),
});

const getRetryAfterSeconds = (headers: Record<string, string>) => {
    const seconds = Number(headers['retry-after']);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

/** Turns a Data API error response into an error that says what to change. */
export const toSupabaseError = (
    response: LiveHttpResponse,
    { table }: { table: string },
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const body = parsed.success ? parsed.data : {};
    const message = [body.message, body.details, body.hint]
        .filter(Boolean)
        .join(' ');
    const detail = message ? `: ${message}` : '';
    if (response.status === 429) {
        const retryAfterSeconds = getRetryAfterSeconds(response.headers);
        return new TooManyRequestsError(
            `Supabase is limiting requests; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'shortly'
            }.`,
            { retryAfterSeconds },
        );
    }
    if (response.status === 401 || response.status === 403) {
        return new WarehouseConnectionError(
            `Supabase rejected the API key${detail}. Use a secret key (sb_secret_…) or the service_role key from the project's API Keys settings, and update this live data source.`,
        );
    }
    if (response.status === 404) {
        return new WarehouseConnectionError(
            `Supabase can't find the table "${table}"${detail}. Check the table name, and that its schema is exposed in the project's Data API settings.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Supabase couldn't read "${table}"${detail}. Check the filter values.`,
        );
    }
    return new UnexpectedServerError(
        `Supabase returned ${response.status}${detail}`,
    );
};
