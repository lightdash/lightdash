import {
    ApiConnectorType,
    getHubspotPropertiesPath,
    getHubspotSearchPath,
    HUBSPOT_OBJECTS,
    HUBSPOT_ORIGIN,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

const SCOPES = HUBSPOT_OBJECTS.flatMap((object) => [
    `crm.objects.${object}.read`,
    `crm.schemas.${object}.read`,
]).join(', ');

export const HUBSPOT_TOKEN_FORM = {
    label: 'HubSpot',
    defaultName: 'HubSpot',
    description: `AI agents read your HubSpot deals, contacts and companies live. In HubSpot, create a private app under Settings, Integrations, Private Apps, give it the ${SCOPES} scopes, and copy its access token.`,
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
