import { HYDRA_DEFAULT_SOURCE, HYDRA_ORIGIN } from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

/**
 * Hydra, the integration with seeded data. It calls nothing, so any token
 * does, there is nothing to test, and a source may reach no path.
 */
export const HYDRA_TOKEN_FORM = {
    origin: HYDRA_ORIGIN,
    account: null,
    tokenLabel: 'Sign-in token',
    tokenHint: 'Any token works: Hydra reads seeded data',
    toApiSource: () => HYDRA_DEFAULT_SOURCE,
    getAccountId: () => '',
    getAccess: () => ({
        allowedMethods: ['GET'],
        allowedPathPrefixes: [],
        allowedContentTypes: ['application/json'],
    }),
} satisfies TokenLiveSourceForm;
