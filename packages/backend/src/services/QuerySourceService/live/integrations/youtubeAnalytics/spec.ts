// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const youtubeAnalyticsSpec: LiveIntegrationSpec = {
    level: {
        value: 3,
        description: 'Yes. Reports return totals per dimension and day.',
    },
    auth: {
        description:
            'Offers OAuth sign-in. Needs Google verification of the scope (in review since 17 Nov). Until then: a warning screen and a 100-user cap.',
        testWith: 'our_account',
        needs: ['gmail', 'someone_adds_us'],
        token: false,
        oauth: 'needs_review',
    },
    limits: {
        paging: { description: 'One call, up to 9,999 rows.' },
        rateLimiting: {
            description:
                'Google publishes no per-minute figure for YouTube Analytics. Matches GA4.',
        },
    },
};
