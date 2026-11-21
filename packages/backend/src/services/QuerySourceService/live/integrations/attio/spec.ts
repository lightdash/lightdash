// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const attioSpec: LiveIntegrationSpec = {
    level: {
        value: 2,
        description:
            'No. Attio has no aggregates, so counts are computed locally.',
    },
    auth: {
        description:
            'Offers a token and OAuth sign-in. No vendor review is needed.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'no_review',
    },
    limits: {
        paging: {
            description: '500 records a page, up to 20 pages (9,999 rows).',
        },
        rateLimiting: {
            description:
                '100 reads a second per workspace; list queries scored by filters and sorts over 10 seconds. Well under the read limit; filter-heavy queries are scored more tightly.',
        },
    },
};
