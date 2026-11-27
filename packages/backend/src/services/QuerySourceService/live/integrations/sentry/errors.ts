import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { type LiveHttpResponse } from '../../types';

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

/**
 * Turns a Sentry error response into an error that says what to change.
 * Sentry's own text is left out: it names Sentry's fields and functions,
 * which the explores never show.
 */
export const toSentryError = (
    response: LiveHttpResponse,
    { organizationSlug }: { organizationSlug: string },
    now = new Date(),
): Error => {
    if (response.status === 429) {
        const retryAfterSeconds = getRetryAfterSeconds(response.headers, now);
        return new TooManyRequestsError(
            `Sentry refused the call because of its rate limit. Sentry limits each endpoint for each caller. Retry in ${
                retryAfterSeconds
                    ? `${retryAfterSeconds} seconds`
                    : 'a short time'
            }.`,
            { retryAfterSeconds },
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            'Sentry rejected the auth token. Create a new token in the internal integration and update this live data source.',
        );
    }
    if (response.status === 403) {
        return new WarehouseConnectionError(
            "The Sentry auth token can't read this. Check the project slugs, and give the internal integration read access to Organization, Project and Issue & Event.",
        );
    }
    if (response.status === 404) {
        return new WarehouseConnectionError(
            `Sentry can't find the organization "${organizationSlug}" or one of its projects. Check the slugs. Check that the token belongs to the organization.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            "Sentry couldn't run this query. Check the filter values and the date range, or select fewer fields.",
        );
    }
    return new UnexpectedServerError(
        `Sentry returned the status ${response.status}.`,
    );
};
