import {
    ApiConnectorType,
    formatHydraBehaviour,
    HYDRA_ACCOUNT_PATH,
    HYDRA_DEFAULT_SETTINGS,
    HYDRA_ORIGIN,
    HYDRA_REPORT_PATH,
    parseHydraBehaviour,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

/**
 * Hydra, the test integration. Its settings go in one line of key=value
 * pairs; any token signs in and seeds its own rows.
 */
export const HYDRA_TOKEN_FORM = {
    origin: HYDRA_ORIGIN,
    account: {
        label: 'Behaviour',
        description:
            'key=value pairs: latencyMs, errorRate (0 to 1), retryAfterEvery, retryAfterSeconds, failAuth, rowCount, callsPerMinute, callsPerHour',
        placeholder: 'Leave blank for defaults',
        invalidMessage:
            'Use key=value pairs with the keys above, numbers of 0 or more, errorRate up to 1 and failAuth true or false',
        normalize: (value) => {
            const parsed = parseHydraBehaviour(value);
            return parsed ? formatHydraBehaviour(parsed) : value.trim();
        },
        isValid: (value) => parseHydraBehaviour(value) !== null,
    },
    tokenLabel: 'Sign-in token',
    tokenHint: 'Any token works, and each one reads its own rows',
    toApiSource: (behaviour) =>
        parseHydraBehaviour(behaviour) ?? HYDRA_DEFAULT_SETTINGS,
    getAccountId: ({ apiSource }) =>
        apiSource?.connector === ApiConnectorType.HYDRA
            ? formatHydraBehaviour(apiSource)
            : '',
    getAccess: () => ({
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: [HYDRA_REPORT_PATH, HYDRA_ACCOUNT_PATH],
        allowedContentTypes: ['application/json'],
    }),
    getTestRequest: () => ({
        method: 'GET',
        path: HYDRA_ACCOUNT_PATH,
        query: {},
    }),
} satisfies TokenLiveSourceForm;
