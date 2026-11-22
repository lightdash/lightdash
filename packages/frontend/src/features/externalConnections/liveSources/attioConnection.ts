import {
    ApiConnectorType,
    ATTIO_OBJECTS,
    ATTIO_ORIGIN,
    getAttioAttributesPath,
    getAttioRecordsQueryPath,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

export const ATTIO_TOKEN_FORM = {
    label: 'Attio',
    defaultName: 'Attio',
    description:
        "AI agents read your Attio companies, people, deals, users and workspaces live. Create an access token in Attio's workspace settings, under Developers, with read access to records and to object configuration.",
    origin: ATTIO_ORIGIN,
    // The token belongs to one workspace, and the source reads every standard object
    account: null,
    tokenLabel: 'Access token',
    toApiSource: () => ({ connector: ApiConnectorType.ATTIO }),
    getAccountId: () => '',
    getAccess: () => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: ATTIO_OBJECTS.flatMap((object) => [
            getAttioAttributesPath(object),
            getAttioRecordsQueryPath(object),
        ]),
        allowedContentTypes: ['application/json'],
    }),
    // Every workspace has companies
    getTestRequest: () => ({
        method: 'GET',
        path: getAttioAttributesPath('companies'),
        query: { limit: '1' },
    }),
} satisfies TokenLiveSourceForm;
