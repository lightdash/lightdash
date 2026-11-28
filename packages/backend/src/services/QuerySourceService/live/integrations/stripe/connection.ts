import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    STRIPE_API_VERSION,
    STRIPE_ORIGIN,
    STRIPE_QUERY_RUNS_PATH,
    STRIPE_SCHEMAS_PATH,
} from '@lightdash/common';
import { z } from 'zod';
import {
    formatTestCount,
    readRule,
    type LiveConnection,
    type LiveTestSummary,
} from '../../sdk';

// The setup test lists the analytical dataset's tables
const testResponseSchema = z.object({
    data: z.array(z.unknown()),
    next_page_url: z.string().nullish(),
});

export const summarizeStripeTest = (body: unknown): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    const { data, next_page_url: nextPageUrl } = parsed.data;
    return {
        summary: 'Connected to your Stripe account',
        // A paged list only shows its first page, so a count would undercount
        facts: nextPageUrl
            ? []
            : [
                  {
                      label: 'Tables to query',
                      value: formatTestCount(data.length),
                  },
              ],
    };
};

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.STRIPE];

export const stripeConnection: LiveConnection<ApiConnectorType.STRIPE> = {
    settings: CATALOG.settings,
    origins: [STRIPE_ORIGIN],
    // POST only starts read-only query runs; Stripe refuses anything but
    // SELECT. Checking a run and reading its pages are GETs under the same path.
    access: () => ({
        rules: [
            readRule('POST', STRIPE_QUERY_RUNS_PATH),
            readRule('GET', STRIPE_QUERY_RUNS_PATH),
            readRule('GET', STRIPE_SCHEMAS_PATH),
        ],
        headers: { 'Stripe-Version': STRIPE_API_VERSION },
    }),
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Stripe connections authenticate with a restricted API key',
            );
        }
    },
    describeTarget: ({ targetLabel }) =>
        `Stripe account${targetLabel ? ` ${targetLabel}` : ''}: charges, balance transactions, disputes, MRR changes, subscriptions and invoices`,
    summarizeTest: summarizeStripeTest,
};
