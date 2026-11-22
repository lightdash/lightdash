import {
    ApiConnectorType,
    ATTIO_OBJECTS,
    ATTIO_ORIGIN,
    ATTIO_WORKSPACE_MEMBERS_PATH,
    getAttioAttributesPath,
    getAttioRecordsQueryPath,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

export const ATTIO_TOKEN_FORM = {
    label: 'Attio',
    defaultName: 'Attio',
    origin: ATTIO_ORIGIN,
    // The token belongs to one workspace, and the source reads every standard object
    account: null,
    tokenLabel: 'Access token',
    tokenHint:
        'From Settings, Developers in Attio, with read access to records, objects and users',
    toApiSource: () => ({ connector: ApiConnectorType.ATTIO }),
    getAccountId: () => '',
    getAccess: () => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: [
            ...ATTIO_OBJECTS.flatMap((object) => [
                getAttioAttributesPath(object),
                getAttioRecordsQueryPath(object),
            ]),
            ATTIO_WORKSPACE_MEMBERS_PATH,
        ],
        allowedContentTypes: ['application/json'],
    }),
    // Every workspace has companies
    getTestRequest: () => ({
        method: 'GET',
        path: getAttioAttributesPath('companies'),
        query: { limit: '1' },
    }),
} satisfies TokenLiveSourceForm;
