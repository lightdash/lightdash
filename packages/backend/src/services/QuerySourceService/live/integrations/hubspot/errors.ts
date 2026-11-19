import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../types';

const errorSchema = z.object({
    message: z.string().optional(),
    category: z.string().optional(),
});

/** Seconds until HubSpot accepts calls again, when it says. */
const getRetryAfterSeconds = (headers: Record<string, string>) => {
    const seconds = Number(headers['retry-after']);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
};

/** Turns a HubSpot error response into an error that says what to change. */
export const toHubspotError = (
    response: LiveHttpResponse,
    { object }: { object: string },
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const message = parsed.success ? (parsed.data.message ?? '') : '';
    const detail = message ? `: ${message}` : '';
    if (response.status === 429) {
        const retryAfterSeconds = getRetryAfterSeconds(response.headers);
        return new TooManyRequestsError(
            `HubSpot rate limit reached${detail}. HubSpot allows a few searches a second per account; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'shortly'
            }.`,
            { retryAfterSeconds },
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            `HubSpot rejected the access token${detail}. Copy the private app's access token again, or rotate it, and update this live data source.`,
        );
    }
    if (response.status === 403) {
        return new WarehouseConnectionError(
            `The HubSpot private app can't read ${object}${detail}. Give it the crm.objects.${object}.read and crm.schemas.${object}.read scopes.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `HubSpot couldn't run this search${detail}. Check the filter values, or use fewer filters.`,
        );
    }
    return new UnexpectedServerError(
        `HubSpot returned ${response.status}${detail}`,
    );
};
