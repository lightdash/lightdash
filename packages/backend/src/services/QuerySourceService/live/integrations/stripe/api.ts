import {
    ApiConnectorType,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type ApiSourceOf,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

export type StripeSettings = ApiSourceOf<ApiConnectorType.STRIPE>;

/** Rows one query returns: five pages of inline results. */
export const STRIPE_MAX_QUERY_ROWS = 4_999;
/** Inline results come back up to 1,000 rows a page. */
export const STRIPE_PAGE_ROWS = 1_000;

/** How long to wait after a 429 that names no resume time. */
export const STRIPE_RETRY_AFTER_SECONDS = 1;

const errorSchema = z.object({
    error: z.object({
        code: z.string().nullish(),
        message: z.string().nullish(),
    }),
});

const readError = (body: unknown) => {
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success) {
        return {
            code: null,
            message: typeof body === 'string' ? body.slice(0, 300) : '',
        };
    }
    return {
        code: parsed.data.error.code ?? null,
        // Our sentence goes on after it
        message: (parsed.data.error.message ?? '').replace(/[.!\s]+$/, ''),
    };
};

/** Turns a Stripe error response into an error that says what to change. */
export const toStripeError = (response: LiveHttpResponse): Error => {
    const { code, message } = readError(response.body);
    const detail = message ? `: ${message}` : '';
    switch (response.status) {
        case 400:
            return new WarehouseQueryError(
                `Stripe rejected the query${detail}`,
                { code },
            );
        case 401:
            return new WarehouseConnectionError(
                `Stripe rejected the API key${detail}. Create a restricted key with Data > Queries > Read and update this live data source.`,
            );
        case 403:
            return new WarehouseConnectionError(
                `The Stripe API key can't run queries${detail}. Give the restricted key Data > Queries > Read; live mode queries may also need a Sigma subscription.`,
            );
        case 404:
            return new WarehouseQueryError(
                `Stripe couldn't find the query run${detail}`,
                { code },
            );
        case 429: {
            // Stripe's limits are per second and it rarely says when to
            // resume, so a call waits a second rather than its whole window
            const retryAfter = Number(response.headers['retry-after']);
            const retryAfterSeconds =
                Number.isFinite(retryAfter) && retryAfter > 0
                    ? retryAfter
                    : STRIPE_RETRY_AFTER_SECONDS;
            return new TooManyRequestsError(
                `Stripe rate limit reached${detail}. Stripe starts up to 10 query runs a second (1 in a sandbox); retry in ${retryAfterSeconds} ${
                    retryAfterSeconds === 1 ? 'second' : 'seconds'
                }.`,
                { retryAfterSeconds },
            );
        }
        default:
            return new UnexpectedServerError(
                `Stripe returned ${response.status}${detail}`,
            );
    }
};
