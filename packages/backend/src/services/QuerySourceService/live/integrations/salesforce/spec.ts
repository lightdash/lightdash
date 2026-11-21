// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const salesforceSpec: LiveIntegrationSpec = {
    level: {
        value: 4,
        description:
            'Yes. SOQL supports GROUP BY and aggregate functions (COUNT, SUM, AVG), so Salesforce does the work. Results come back in batches of up to 2,000 rows.',
    },
    auth: {
        description: 'Offers OAuth sign-in. No vendor review is needed.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: false,
        oauth: 'no_review',
    },
    limits: {
        paging: {
            description:
                'Records in batches of 2,000, up to 9,999 rows; aggregate queries are one call up to 2,000 groups.',
        },
        rateLimiting: {
            description:
                "API calls per 24 hours per org (15,000 on Developer Edition, 100,000 and up on paid), shared with the org's other apps. 500 an hour keeps one source under the smallest daily allowance.",
        },
    },
};
