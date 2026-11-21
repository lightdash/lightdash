// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const ga4Spec: LiveIntegrationSpec = {
    level: {
        value: 3,
        description: 'Yes. Reports return totals per dimension.',
    },
    auth: {
        description:
            'Offers OAuth sign-in. Needs Google verification of the scope (in review since 17 Nov). Until then: a warning screen and a 100-user cap.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: false,
        oauth: 'needs_review',
    },
    limits: {
        paging: { description: 'One report call, up to 24,999 rows.' },
        rateLimiting: {
            description:
                'Standard properties: 10 requests at once, plus hourly and daily tokens per property. Half the concurrent limit; Google reports token use back.',
        },
    },
};
