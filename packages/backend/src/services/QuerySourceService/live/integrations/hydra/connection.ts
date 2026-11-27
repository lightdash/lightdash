import {
    ApiConnectorType,
    getHydraObjectReportPath,
    getHydraSettingsProblem,
    HYDRA_ACCOUNT_PATH,
    HYDRA_OBJECTS_PATH,
    HYDRA_ORIGIN,
    HYDRA_REPORT_PATH,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    type HydraApiSource,
} from '@lightdash/common';
import { z } from 'zod';
import {
    formatTestCount,
    readRule,
    type LiveConnection,
    type LiveExploreDefinition,
    type LiveTestSummary,
} from '../../sdk';

// The setup test reads the account the token's rows belong to
const testResponseSchema = z.object({
    account: z.string(),
    events: z.number(),
    users: z.number(),
});

export const summarizeHydraTest = (body: unknown): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: `Connected to Hydra account ${parsed.data.account}`,
        facts: [
            { label: 'Events', value: formatTestCount(parsed.data.events) },
            { label: 'Users', value: formatTestCount(parsed.data.users) },
        ],
    };
};

/** The reports and account, the object list, and the report path of each object explore. */
export const getHydraAccess = (
    _settings: HydraApiSource,
    explores: readonly LiveExploreDefinition[],
) => ({
    rules: [
        readRule('POST', HYDRA_REPORT_PATH),
        readRule('GET', HYDRA_ACCOUNT_PATH),
        readRule('GET', HYDRA_OBJECTS_PATH, { exact: true }),
        // An object's explore carries the object's id as its `apiName`
        ...explores.flatMap(({ apiName }) =>
            apiName === undefined
                ? []
                : [
                      readRule('POST', getHydraObjectReportPath(apiName), {
                          exact: true,
                          entry: apiName,
                      }),
                  ],
        ),
    ],
});

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.HYDRA];

export const hydraConnection: LiveConnection<ApiConnectorType.HYDRA> = {
    settings: CATALOG.settings,
    origins: [HYDRA_ORIGIN],
    access: getHydraAccess,
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Hydra connections authenticate with a token',
            );
        }
    },
    validate: (settings) => {
        const problem = getHydraSettingsProblem(settings);
        if (problem) {
            throw new ParameterError(`The Hydra setting ${problem}`);
        }
    },
    describeTarget: () =>
        'Hydra test data: seeded product events and users, for testing',
    summarizeTest: summarizeHydraTest,
};
