// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const hubspotSpec: LiveIntegrationSpec = {
    level: {
        value: 2,
        description:
            'No. Search filters records, but totals are computed locally after paging, so live queries only work for small filtered slices.',
    },
    auth: {
        description:
            'Offers a token and OAuth sign-in. No vendor review is needed.',
        testWith: 'test_account',
        needs: ['gmail', 'phone'],
        token: true,
        oauth: 'no_review',
    },
    limits: {
        paging: {
            description:
                '200 records a page, up to 5 pages (1,000 rows); counts and lists both page.',
        },
        rateLimiting: {
            description:
                'About 5 searches a second per account; private apps 100 to 190 calls per 10 seconds by plan. Stays well under 5 searches a second, since one query can page 5 times.',
        },
    },
};
