// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const pylonSpec: LiveIntegrationSpec = {
    level: {
        value: 2,
        description:
            'No. Filtered search returns records; totals are computed locally.',
    },
    auth: {
        description: 'Offers a token. No vendor review is needed.',
        testWith: 'our_account',
        needs: ['gmail', 'someone_adds_us'],
        token: true,
        oauth: 'none',
    },
    limits: {
        paging: {
            description:
                '1,000 records a page, up to 10 pages, plus name lookups (up to 23 calls a query).',
        },
        rateLimiting: {
            description:
                '120 calls a minute per search endpoint, per workspace; no limit on calls at once. A query can make 23 calls, so 2 at a time keeps a busy dashboard under 120 a minute.',
        },
    },
};
