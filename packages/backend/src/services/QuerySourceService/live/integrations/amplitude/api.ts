import { z } from 'zod';
import { toLiveHttpError, type LiveHttpResponse } from '../../sdk';

/**
 * Amplitude's built-in user properties, which every project has. Custom
 * properties (`gp:` names) differ per project and are not offered yet.
 */
export const AMPLITUDE_USER_PROPERTIES = [
    'country',
    'region',
    'city',
    'platform',
    'os',
    'device_type',
    'language',
    'version',
] as const;

export type AmplitudeUserProperty = (typeof AMPLITUDE_USER_PROPERTIES)[number];

/** Dimensions that group by one user property; Amplitude groups by one at a time. */
export const isAmplitudeUserProperty = (
    apiName: string,
): apiName is AmplitudeUserProperty =>
    (AMPLITUDE_USER_PROPERTIES as readonly string[]).includes(apiName);

/** Day, week and month as Amplitude's `i` interval. */
export const AMPLITUDE_INTERVALS = { date: 1, week: 7, month: 30 } as const;

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

/** Turns a Dashboard API error into an error that says what to change. */
export const toAmplitudeError = (response: LiveHttpResponse): Error => {
    const detail = getDetail(response.body);
    return toLiveHttpError(response, {
        rateLimited: (retryAfterSeconds) =>
            `Amplitude rate limit reached${detail}. Amplitude allows 5 queries at once per project and limits their cost per hour; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'in a few minutes'
            }, or shorten the date range.`,
        connection: {
            401: `Amplitude rejected the API key and secret key${detail}. Copy both from the project's settings in Amplitude and update this live data source.`,
            403: `Amplitude denied access${detail}. Check that the API key and secret key belong to the same project, and that the source's data region (US or EU) is the project's.`,
        },
        rejected: `Amplitude rejected the request${detail}.`,
        failed: `Amplitude returned ${response.status}${detail}.`,
    });
};
