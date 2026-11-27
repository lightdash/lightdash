import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

// Mixpanel's Query API errors are JSON with an `error` string next to a
// `request` echo, `status` and `error_code`, or plain text.
const errorSchema = z.union([
    z.string(),
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

/** Seconds until Mixpanel accepts calls again, when it says. */
const getRetryAfterSeconds = (headers: Record<string, string>) => {
    const seconds = Number(headers['retry-after']);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
};

/** Turns a Query API error into an error that says what to change. */
export const toMixpanelError = (response: LiveHttpResponse): Error => {
    const detail = getDetail(response.body);
    if (response.status === 429) {
        const retryAfterSeconds = getRetryAfterSeconds(response.headers);
        return new TooManyRequestsError(
            `Mixpanel rate limit reached${detail}. Mixpanel allows 60 queries an hour and 5 at once per project, shared with its other clients; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'later this hour'
            }, or rely on cached results.`,
            { retryAfterSeconds },
        );
    }
    // The Query API needs a Growth or Enterprise plan; other plans get 402
    if (response.status === 402) {
        return new WarehouseConnectionError(
            `Mixpanel refused the query because of the project's plan${detail}. The Query API needs a Growth or Enterprise plan; upgrade the project in Mixpanel, then try again.`,
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            `Mixpanel rejected the service account${detail}. Check its username and secret in Mixpanel's organization settings and add this live data source again.`,
        );
    }
    if (response.status === 403) {
        return new WarehouseConnectionError(
            `Mixpanel denied access${detail}. Check that the service account belongs to the project, and that the source's project ID and data region (US, EU or India) are the project's.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Mixpanel rejected the request${detail}.`,
        );
    }
    return new UnexpectedServerError(
        `Mixpanel returned ${response.status}${detail}.`,
    );
};
