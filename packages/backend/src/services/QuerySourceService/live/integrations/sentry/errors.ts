import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../types';

const errorSchema = z.object({
    detail: z
        .union([z.string(), z.object({ message: z.string().optional() })])
        .optional(),
});

const readMessage = (body: unknown) => {
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success || parsed.data.detail === undefined) {
        return '';
    }
    const { detail } = parsed.data;
    return (
        (typeof detail === 'string' ? detail : (detail.message ?? ''))
            .slice(0, 300)
            // Our sentence goes on after it
            .replace(/[.!\s]+$/, '')
    );
};

/** Seconds until Sentry accepts calls again, from its rate limit headers. */
const getRetryAfterSeconds = (
    headers: Record<string, string>,
    now: Date,
): number | null => {
    const retryAfter = Number(headers['retry-after']);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
        return retryAfter;
    }
    const reset = Number(headers['x-sentry-rate-limit-reset']);
    if (Number.isFinite(reset) && reset > 0) {
        return Math.max(1, Math.ceil(reset - now.getTime() / 1000));
    }
    return null;
};

/** Turns a Sentry error response into an error that says what to change. */
export const toSentryError = (
    response: LiveHttpResponse,
    { organizationSlug }: { organizationSlug: string },
    now = new Date(),
): Error => {
    const message = readMessage(response.body);
    const detail = message ? `: ${message}` : '';
    if (response.status === 429) {
        const retryAfterSeconds = getRetryAfterSeconds(response.headers, now);
        return new TooManyRequestsError(
            `Sentry rate limit reached. Sentry limits each endpoint per caller; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'shortly'
            }.`,
            { retryAfterSeconds },
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            `Sentry rejected the auth token${detail}. Create a new token in the internal integration and update this live data source.`,
        );
    }
    if (response.status === 403) {
        return new WarehouseConnectionError(
            `The Sentry auth token can't read this${detail}. Give the internal integration read access to Organization, Project and Issue & Event.`,
        );
    }
    if (response.status === 404) {
        return new WarehouseConnectionError(
            `Sentry can't find the organization "${organizationSlug}" or one of its projects${detail}. Check the slugs and that the token belongs to the organization.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Sentry couldn't run this query${detail}. Check the filter values and the date range.`,
        );
    }
    return new UnexpectedServerError(
        `Sentry returned ${response.status}${detail}`,
    );
};
