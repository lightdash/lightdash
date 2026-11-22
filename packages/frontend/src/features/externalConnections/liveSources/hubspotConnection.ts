import {
    ApiConnectorType,
    getHubspotPropertiesPath,
    getHubspotSearchPath,
    HUBSPOT_OBJECTS,
    HUBSPOT_ORIGIN,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

export const HUBSPOT_TOKEN_FORM = {
    label: 'HubSpot',
    defaultName: 'HubSpot',
    origin: HUBSPOT_ORIGIN,
    // The token belongs to one HubSpot account, so there is nothing else to pick
    account: null,
    tokenLabel: 'Access token',
    toApiSource: () => ({ connector: ApiConnectorType.HUBSPOT }),
    getAccountId: () => '',
    getAccess: () => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: HUBSPOT_OBJECTS.flatMap((object) => [
            getHubspotPropertiesPath(object),
            getHubspotSearchPath(object),
        ]),
        allowedContentTypes: ['application/json'],
    }),
    getTestRequest: () => ({
        method: 'GET',
        path: getHubspotPropertiesPath('deals'),
        query: {},
    }),
} satisfies TokenLiveSourceForm;
