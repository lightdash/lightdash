// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const googleAdsSpec: LiveIntegrationSpec = {
    level: {
        value: 3,
        description:
            'Yes. GAQL reports return totals by the segments you pick (date, campaign, ad group).',
    },
    auth: {
        description:
            'Offers OAuth sign-in. Needs Google verification plus a Google Ads access level: Explorer, then Basic or Standard for real customer volume.',
        testWith: 'paid_account',
        needs: ['gmail', 'card'],
        token: false,
        oauth: 'needs_review',
    },
    paging: { description: 'One call, up to 9,999 rows.' },
    rateLimiting: {
        description:
            "Daily operations shared by every connection of the server's Google client (2,880 at Explorer access). So one source can't use up the shared daily operations.",
    },
};
