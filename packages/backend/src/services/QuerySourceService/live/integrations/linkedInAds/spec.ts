// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const linkedInAdsSpec: LiveIntegrationSpec = {
    level: {
        value: 3,
        description:
            'Yes. adAnalytics returns totals per pivot and time grain.',
    },
    auth: {
        description:
            "Offers OAuth sign-in. Needs Advertising API approval: Development tier first, then Standard tier to read customers' ad accounts.",
        testWith: 'paid_account',
        needs: ['gmail', 'phone', 'card', 'real_person', 'vendor_approval'],
        token: false,
        oauth: 'needs_review',
    },
    limits: {
        paging: { description: 'One call, up to 14,999 rows.' },
        rateLimiting: {
            description:
                "Daily per-app and per-member limits shown in LinkedIn's developer portal, not published as fixed numbers. Same defaults as the other ads integrations.",
        },
    },
};
