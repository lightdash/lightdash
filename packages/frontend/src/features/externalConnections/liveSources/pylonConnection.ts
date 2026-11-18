import {
    ApiConnectorType,
    PYLON_ACCOUNTS_SEARCH_PATH,
    PYLON_CONTACTS_SEARCH_PATH,
    PYLON_ISSUES_SEARCH_PATH,
    PYLON_ORIGIN,
    PYLON_USERS_PATH,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

export const PYLON_TOKEN_FORM = {
    label: 'Pylon',
    defaultName: 'Pylon',
    description:
        'AI agents read support issues, customer accounts and contacts of your Pylon workspace live. A Pylon admin creates the API token in Settings, API Tokens.',
    origin: PYLON_ORIGIN,
    // The token belongs to one workspace, so there is nothing else to pick
    account: null,
    tokenLabel: 'API token',
    toApiSource: () => ({ connector: ApiConnectorType.PYLON }),
    getAccountId: () => '',
    getAccess: () => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: [
            PYLON_ISSUES_SEARCH_PATH,
            PYLON_ACCOUNTS_SEARCH_PATH,
            PYLON_CONTACTS_SEARCH_PATH,
            PYLON_USERS_PATH,
        ],
        allowedContentTypes: ['application/json'],
    }),
    getTestRequest: () => ({
        method: 'GET',
        path: PYLON_USERS_PATH,
        query: {},
    }),
} satisfies TokenLiveSourceForm;
