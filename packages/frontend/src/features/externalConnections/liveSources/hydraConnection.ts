import {
    ApiConnectorType,
    formatHydraBehaviour,
    HYDRA_ACCOUNT_PATH,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_ORIGIN,
    HYDRA_REPORT_PATH,
    parseHydraBehaviour,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

/**
 * Hydra, the test integration. Its settings go in one line of key=value
 * pairs, or JSON; any token signs in and seeds its own rows.
 */
export const HYDRA_TOKEN_FORM = {
    origin: HYDRA_ORIGIN,
    account: {
        label: 'Behaviour',
        description:
            'Keys like latencyMs, failAuth, errorRate and pageSize, or JSON for limits and mock responses',
        placeholder: 'Leave blank for defaults',
        invalidMessage:
            'Use key=value pairs with the keys above, or a JSON object of Hydra settings',
        normalize: (value) => {
            const parsed = parseHydraBehaviour(value);
            return parsed ? formatHydraBehaviour(parsed) : value.trim();
        },
        isValid: (value) => parseHydraBehaviour(value) !== null,
    },
    tokenLabel: 'Sign-in token',
    tokenHint: 'Any token works, and each one reads its own rows',
    toApiSource: (behaviour) =>
        parseHydraBehaviour(behaviour) ?? HYDRA_DEFAULT_SOURCE,
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
