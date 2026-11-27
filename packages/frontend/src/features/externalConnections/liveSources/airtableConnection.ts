import {
    AIRTABLE_BASE_ID,
    AIRTABLE_ORIGIN,
    ApiConnectorType,
    getAirtableTablesPath,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

// appXXXXXXXXXXXXXX, anywhere in what was pasted: a base, table or view URL
const BASE_ID = /\b(app[A-Za-z0-9]{14})\b/;

export const AIRTABLE_TOKEN_FORM = {
    origin: AIRTABLE_ORIGIN,
    account: {
        label: 'Base',
        description:
            "Paste the base's URL from Airtable; each of its tables becomes an explore",
        placeholder: 'https://airtable.com/appXXXXXXXXXXXXXX',
        invalidMessage:
            "Paste the base's URL, which holds its id (app followed by 14 characters)",
        // Accept a pasted base, table or view URL
        normalize: (value) => value.trim().match(BASE_ID)?.[1] ?? value.trim(),
        isValid: (value) => AIRTABLE_BASE_ID.test(value),
    },
    tokenLabel: 'Personal access token',
    tokenHint:
        'Scopes data.records:read and schema.bases:read, with access to the base',
    toApiSource: (baseId) => ({
        connector: ApiConnectorType.AIRTABLE,
        baseId,
    }),
    getAccountId: ({ apiSource }) =>
        apiSource?.connector === ApiConnectorType.AIRTABLE
            ? apiSource.baseId
            : '',
    // The base's records and schema; the server narrows records to the
    // tables the source reads
    getAccess: (baseId) => ({
        allowedMethods: ['GET'],
        allowedPathPrefixes: [`/v0/${baseId}/`, getAirtableTablesPath(baseId)],
        allowedContentTypes: ['application/json'],
    }),
    // Reads the base schema, which lists the tables and proves the token
    // reaches the base; records are read on the first query
    getTestRequest: (baseId) => ({
        method: 'GET',
        path: getAirtableTablesPath(baseId),
        query: {},
    }),
} satisfies TokenLiveSourceForm;
