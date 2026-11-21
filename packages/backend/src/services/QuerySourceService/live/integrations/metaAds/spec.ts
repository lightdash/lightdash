// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const metaAdsSpec: LiveIntegrationSpec = {
    level: {
        value: 3,
        description:
            'Yes. Insights returns totals per campaign, ad set, ad and date.',
    },
    auth: {
        description:
            'Offers a token and OAuth sign-in. Needs Meta business verification and App Review for ads_read.',
        testWith: 'paid_account',
        needs: ['gmail', 'phone', 'card', 'real_person'],
        token: true,
        oauth: 'needs_review',
    },
    paging: { description: '500 rows a page, up to 10 pages (5,000 rows).' },
    rateLimiting: {
        description:
            "Load counted per app and ad account; Meta publishes no fixed number. Kept well below what Meta's best-practices page warns about.",
    },
};
