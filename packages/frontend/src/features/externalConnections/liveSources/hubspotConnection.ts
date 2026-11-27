import {
    ApiConnectorType,
    getHubspotPropertiesPath,
    HUBSPOT_ORIGIN,
    HUBSPOT_PATH_PREFIXES,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

export const HUBSPOT_TOKEN_FORM = {
    origin: HUBSPOT_ORIGIN,
    // The token belongs to one HubSpot account, so there is nothing else to pick
    account: null,
    tokenLabel: 'Access token',
    toApiSource: () => ({ connector: ApiConnectorType.HUBSPOT }),
    getAccountId: () => '',
    getAccess: () => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: HUBSPOT_PATH_PREFIXES,
        allowedContentTypes: ['application/json'],
    }),
    getTestRequest: () => ({
        method: 'GET',
        path: getHubspotPropertiesPath('deals'),
        query: {},
    }),
} satisfies TokenLiveSourceForm;
