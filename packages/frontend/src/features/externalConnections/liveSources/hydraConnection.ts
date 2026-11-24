import {
    HYDRA_ACCOUNT_PATH,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_ORIGIN,
    HYDRA_REPORT_PATH,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

/**
 * Hydra, the test integration. Any token signs in and seeds its own rows; a
 * source made here takes the default settings, and tests set others through
 * the API.
 */
export const HYDRA_TOKEN_FORM = {
    origin: HYDRA_ORIGIN,
    account: null,
    tokenLabel: 'Sign-in token',
    tokenHint: 'Any token works, and each one reads its own rows',
    toApiSource: () => HYDRA_DEFAULT_SOURCE,
    getAccountId: () => '',
    getAccess: () => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: [HYDRA_REPORT_PATH, HYDRA_ACCOUNT_PATH],
        allowedContentTypes: ['application/json'],
    }),
    getTestRequest: () => ({
        method: 'GET',
        path: HYDRA_ACCOUNT_PATH,
        query: {},
    }),
} satisfies TokenLiveSourceForm;
