import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    PYLON_ACCOUNTS_SEARCH_PATH,
    PYLON_CONTACTS_SEARCH_PATH,
    PYLON_ISSUES_SEARCH_PATH,
    PYLON_ORIGIN,
    PYLON_USERS_PATH,
} from '@lightdash/common';
import { z } from 'zod';
import {
    formatTestCount,
    readRule,
    summarizeTestWith,
    type LiveConnection,
} from '../../sdk';

// The setup test lists the workspace's users
const testResponseSchema = z.object({ data: z.array(z.unknown()) });

export const summarizePylonTest = summarizeTestWith(
    testResponseSchema,
    ({ data }) => ({
        summary: 'Connected to your Pylon workspace',
        facts: [
            { label: 'Workspace users', value: formatTestCount(data.length) },
        ],
    }),
);

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.PYLON];

export const pylonConnection: LiveConnection<ApiConnectorType.PYLON> = {
    settings: CATALOG.settings,
    origins: [PYLON_ORIGIN],
    // Searches are POSTs but only read; nothing else on the API is reachable
    access: () => ({
        rules: [
            readRule('POST', PYLON_ISSUES_SEARCH_PATH),
            readRule('POST', PYLON_ACCOUNTS_SEARCH_PATH),
            readRule('POST', PYLON_CONTACTS_SEARCH_PATH),
            readRule('GET', PYLON_USERS_PATH),
        ],
    }),
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Pylon connections authenticate with an API token',
            );
        }
    },
    describeTarget: ({ targetLabel }) =>
        `Pylon workspace${targetLabel ? ` ${targetLabel}` : ''}: support issues, customer accounts and contacts`,
    summarizeTest: summarizePylonTest,
};
