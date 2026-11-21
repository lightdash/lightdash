// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const postHogSpec: LiveIntegrationSpec = {
    level: {
        value: 5,
        description: 'Yes. HogQL is SQL.',
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
            description:
                'One HogQL query, up to 49,999 rows; property scans page 500 at a time.',
        },
        rateLimiting: {
            description:
                "Query API per PostHog project: 3 at once, 240 a minute, 2,400 an hour. Matches PostHog's published limits exactly.",
        },
    },
};
