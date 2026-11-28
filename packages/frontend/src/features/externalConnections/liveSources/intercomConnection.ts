import {
    ApiConnectorType,
    INTERCOM_PATHS,
    INTERCOM_REGION_ORIGINS,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

export const INTERCOM_TOKEN_FORM = {
    origin: INTERCOM_REGION_ORIGINS.us,
    // The token belongs to one workspace, so there is nothing else to pick
    account: null,
    regions: {
        label: 'Region',
        hint: 'Where your Intercom workspace is hosted',
        options: [
            { label: 'United States', origin: INTERCOM_REGION_ORIGINS.us },
            { label: 'Europe', origin: INTERCOM_REGION_ORIGINS.eu },
            { label: 'Australia', origin: INTERCOM_REGION_ORIGINS.au },
        ],
    },
    tokenLabel: 'Access token',
    tokenHint:
        "From your app in Intercom's Developer Hub; read permissions are enough",
    toApiSource: () => ({ connector: ApiConnectorType.INTERCOM }),
    getAccountId: () => '',
    getAccess: () => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: Object.values(INTERCOM_PATHS),
        allowedContentTypes: ['application/json'],
    }),
    getTestRequest: () => ({
        method: 'GET',
        path: INTERCOM_PATHS.me,
        query: {},
    }),
} satisfies TokenLiveSourceForm;
