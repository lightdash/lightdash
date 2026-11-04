import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import type { ApiConnectorResponse } from '../ApiConnector';

const googleErrorSchema = z.object({
    error: z.object({
        message: z.string().optional(),
        status: z.string().optional(),
    }),
});

/** Turns a Google API error response into an error that says what to change. */
export const toGoogleApiError = (
    response: ApiConnectorResponse,
    { label, resource }: { label: string; resource: string },
): Error => {
    const parsed = googleErrorSchema.safeParse(response.body);
    const message = parsed.success ? parsed.data.error.message : undefined;
    const detail = message ? `: ${message}` : '';
    switch (response.status) {
        case 400:
            return new WarehouseQueryError(
                `${label} rejected the request${detail}`,
            );
        case 401:
        case 403:
            if (
                parsed.success &&
                parsed.data.error.status === 'RESOURCE_EXHAUSTED'
            ) {
                return new TooManyRequestsError(
                    `${label} quota exceeded${detail}. Retry in a minute.`,
                    { retryAfterSeconds: null },
                );
            }
            return new WarehouseConnectionError(
                `Google denied access to ${resource}${detail}. Check that the signed-in Google account can still read it, or reconnect the source.`,
            );
        case 404:
            return new WarehouseConnectionError(
                `${label} could not find ${resource}${detail}`,
            );
        case 429: {
            const retryAfter = Number(
                response.headers['retry-after'] ?? Number.NaN,
            );
            const retryAfterSeconds = Number.isFinite(retryAfter)
                ? retryAfter
                : null;
            return new TooManyRequestsError(
                `${label} quota exceeded${detail}. ${
                    retryAfterSeconds !== null
                        ? `Retry after ${retryAfterSeconds} seconds.`
                        : 'Retry in a minute.'
                }`,
                { retryAfterSeconds },
            );
        }
        default:
            return new UnexpectedServerError(
                `${label} returned ${response.status}${detail}`,
            );
    }
};
