import {
    ApiConnectorType,
    ATTIO_ORIGIN,
    getAttioAttributesPath,
    getAttioRecordsQueryPath,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

// An object's slug, as Attio's workspace settings show it
const OBJECT_SLUG = /^[a-z0-9_]{1,64}$/;

export const ATTIO_TOKEN_FORM: TokenLiveSourceForm = {
    label: 'Attio',
    defaultName: 'Attio',
    description:
        "AI agents read the records of one Attio object live, such as companies, people or deals. Create an access token in Attio's workspace settings, under Developers, with read access to records and to object configuration.",
    origin: ATTIO_ORIGIN,
    account: {
        label: 'Object',
        description:
            "The object's slug, from Attio's workspace settings under Objects",
        placeholder: 'companies',
        invalidMessage:
            'Enter the object slug, lowercase letters, digits and underscores',
        normalize: (value) => value.trim().toLowerCase(),
        isValid: (value) => OBJECT_SLUG.test(value),
    },
    tokenLabel: 'Access token',
    toApiSource: (object) => ({ connector: ApiConnectorType.ATTIO, object }),
    getAccountId: ({ apiSource }) =>
        apiSource?.connector === ApiConnectorType.ATTIO ? apiSource.object : '',
    getAccess: (object) => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: [
            getAttioAttributesPath(object),
            getAttioRecordsQueryPath(object),
        ],
        allowedContentTypes: ['application/json'],
    }),
    getTestRequest: (object) => ({
        method: 'GET',
        path: getAttioAttributesPath(object),
        query: { limit: '1' },
    }),
};
