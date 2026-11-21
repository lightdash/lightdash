// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const searchConsoleSpec: LiveIntegrationSpec = {
    level: {
        value: 3,
        description: 'Yes. Reports return totals per dimension.',
    },
    auth: {
        description:
            'Offers OAuth sign-in. Needs Google verification of the scope (in review since 17 Nov). Until then: a warning screen and a 100-user cap.',
        testWith: 'our_account',
        needs: ['gmail', 'someone_adds_us'],
        token: false,
        oauth: 'needs_review',
    },
    paging: { description: 'One call, up to 24,999 rows.' },
    rateLimiting: {
        description:
            'Search Analytics: 1,200 queries a minute per site and per user. Half the per-minute limit.',
    },
};
