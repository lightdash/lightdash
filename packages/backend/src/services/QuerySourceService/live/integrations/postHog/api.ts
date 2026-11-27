import {
    ApiConnectorType,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type ApiSourceOf,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

// PostHog runs a query for up to 10s once it leaves the queue.
const POSTHOG_QUERY_RUN_MS = 10_000;
export const WRAP_PREFIX = 'SELECT * FROM (\n';

export type PostHogSettings = ApiSourceOf<ApiConnectorType.POSTHOG>;

export const getPostHogQueryPath = (projectId: string) =>
    `/api/projects/${projectId}/query/`;

export const getPostHogPropertyDefinitionsPrefix = (projectId: string) =>
    `/api/projects/${projectId}/property_definitions/`;

export const getPostHogOAuthEndpoints = (origin: string) => ({
    authorizeUrl: new URL('/oauth/authorize/', origin).href,
    tokenUrl: new URL('/oauth/token/', origin).href,
});

const errorSchema = z.object({
    detail: z.string().optional(),
    code: z.string().optional(),
    extra: z
        .object({
            hogql_metadata: z
                .object({
                    errors: z.array(
                        z.object({ start: z.number(), end: z.number() }),
                    ),
                })
                .optional(),
        })
        .optional(),
});

export const toPostHogError = (
    response: LiveHttpResponse,
    { projectId }: PostHogSettings,
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const detail = parsed.success ? parsed.data.detail : undefined;
    switch (response.status) {
        case 400: {
            // Positions point into the wrapped query; shift them back to the caller's.
            const position =
                parsed.success && parsed.data.extra?.hogql_metadata?.errors[0];
            return new WarehouseQueryError(
                `PostHog rejected the query: ${detail ?? 'invalid HogQL'}`,
                {
                    code: parsed.success ? (parsed.data.code ?? null) : null,
                    ...(position && position.start >= WRAP_PREFIX.length
                        ? {
                              start: position.start - WRAP_PREFIX.length,
                              end: position.end - WRAP_PREFIX.length,
                          }
                        : {}),
                },
            );
        }
        case 401:
        case 403:
            return new WarehouseConnectionError(
                `PostHog rejected the API key. Check that the key has the Query Read scope and belongs to the connection's region (US or EU).`,
            );
        case 404:
            return new WarehouseConnectionError(
                `PostHog project ${projectId} was not found in the connection's region`,
            );
        case 429: {
            const retryAfter = Number(
                response.headers['retry-after'] ?? Number.NaN,
            );
            const retryAfterSeconds = Number.isFinite(retryAfter)
                ? retryAfter
                : null;
            return new TooManyRequestsError(
                `PostHog query budget exceeded${detail ? `: ${detail}` : ''}. ${
                    retryAfterSeconds !== null
                        ? `Retry after ${retryAfterSeconds} seconds.`
                        : 'Retry in a minute.'
                }`,
                { retryAfterSeconds },
            );
        }
        case 504:
            return new TimeoutError(
                `PostHog stopped the query after ${
                    POSTHOG_QUERY_RUN_MS / 1000
                } seconds. Narrow the date range or aggregate further.`,
            );
        default:
            return new UnexpectedServerError(
                `PostHog returned ${response.status}${
                    detail ? `: ${detail}` : ''
                }`,
            );
    }
};
