import {
    ApiConnectorType,
    getHubspotPropertiesPath,
    getHubspotSearchPath,
    HUBSPOT_OBJECTS,
    HUBSPOT_ORIGIN,
    type HubspotObject,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

const isHubspotObject = (value: string): value is HubspotObject =>
    (HUBSPOT_OBJECTS as readonly string[]).includes(value);

export const HUBSPOT_TOKEN_FORM: TokenLiveSourceForm = {
    label: 'HubSpot',
    defaultName: 'HubSpot',
    description:
        "AI agents read the records of one HubSpot CRM object live: deals, contacts or companies. In HubSpot, create a private app under Settings, Integrations, Private Apps, give it the object's crm.objects.<object>.read and crm.schemas.<object>.read scopes, and copy its access token.",
    origin: HUBSPOT_ORIGIN,
    account: {
        label: 'Object',
        description: 'deals, contacts or companies',
        placeholder: 'deals',
        invalidMessage: 'Enter deals, contacts or companies',
        normalize: (value) => value.trim().toLowerCase(),
        isValid: isHubspotObject,
    },
    tokenLabel: 'Access token',
    toApiSource: (object) => ({
        connector: ApiConnectorType.HUBSPOT,
        // The form only submits a valid object
        object: object as HubspotObject,
    }),
    getAccountId: ({ apiSource }) =>
        apiSource?.connector === ApiConnectorType.HUBSPOT
            ? apiSource.object
            : '',
    getAccess: (object) => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: [
            getHubspotPropertiesPath(object),
            getHubspotSearchPath(object),
        ],
        allowedContentTypes: ['application/json'],
    }),
    getTestRequest: (object) => ({
        method: 'GET',
        path: getHubspotPropertiesPath(object),
        query: {},
    }),
};
