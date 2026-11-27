import {
    ApiConnectorType,
    STRIPE_ORIGIN,
    STRIPE_QUERY_RUNS_PATH,
    STRIPE_SCHEMAS_PATH,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

export const STRIPE_TOKEN_FORM = {
    origin: STRIPE_ORIGIN,
    // The key belongs to one Stripe account, so there is nothing else to pick
    account: null,
    tokenLabel: 'Restricted API key',
    tokenHint:
        'A restricted key with Data > Queries > Read is enough. Sandbox keys work too.',
    toApiSource: () => ({ connector: ApiConnectorType.STRIPE }),
    getAccountId: () => '',
    getAccess: () => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: [STRIPE_QUERY_RUNS_PATH, STRIPE_SCHEMAS_PATH],
        allowedContentTypes: ['application/json'],
    }),
    // Listing the analytical tables needs the same permission as queries
    getTestRequest: () => ({
        method: 'GET',
        path: STRIPE_SCHEMAS_PATH,
        query: { dataset: 'analytical' },
    }),
} satisfies TokenLiveSourceForm;
