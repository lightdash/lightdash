// What this integration's code can't know about the tool it calls. Change
// it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const githubSpec: LiveIntegrationSpec = {
    level: {
        value: 2,
        description:
            'Counts only. Search returns a total count for a filter; anything else is aggregated locally after paging.',
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
                '100 results a page, up to 10 pages; search stops at 1,000 results.',
        },
        rateLimiting: {
            description:
                "Search: 30 calls a minute per token. REST: 5,000 an hour. Matches search's 30 a minute exactly, which leaves no room for the token's other users.",
        },
    },
};
