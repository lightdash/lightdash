import {
    ApiConnectorType,
    getIntercomRegion,
    INTERCOM_API_VERSION,
    INTERCOM_PATHS,
    INTERCOM_REGION_ORIGINS,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import { readRule, type LiveConnection, type LiveTestSummary } from '../../sdk';

// The setup test reads the token's own teammate and its workspace
const testResponseSchema = z.object({
    app: z
        .object({
            name: z.string().nullable().optional(),
            region: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
});

export const summarizeIntercomTest = (
    body: unknown,
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success || !parsed.data.app) return null;
    const { name, region } = parsed.data.app;
    return {
        summary: 'Connected to your Intercom workspace',
        facts: [
            ...(name ? [{ label: 'Workspace', value: name }] : []),
            ...(region ? [{ label: 'Region', value: region }] : []),
        ],
    };
};

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.INTERCOM];

export const intercomConnection: LiveConnection<ApiConnectorType.INTERCOM> = {
    settings: CATALOG.settings,
    origins: [
        INTERCOM_REGION_ORIGINS.us,
        INTERCOM_REGION_ORIGINS.eu,
        INTERCOM_REGION_ORIGINS.au,
    ],
    // Searches are POSTs but only read; nothing else on the API is reachable
    access: () => ({
        rules: [
            readRule('POST', INTERCOM_PATHS.conversationsSearch),
            readRule('POST', INTERCOM_PATHS.ticketsSearch),
            readRule('POST', INTERCOM_PATHS.contactsSearch),
            readRule('GET', INTERCOM_PATHS.admins),
            readRule('GET', INTERCOM_PATHS.teams),
            readRule('GET', INTERCOM_PATHS.me),
        ],
        headers: {
            Accept: 'application/json',
            'Intercom-Version': INTERCOM_API_VERSION,
        },
    }),
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Intercom live data sources sign in with an access token',
            );
        }
    },
    describeTarget: ({ origin, targetLabel }) =>
        `Intercom workspace${targetLabel ? ` ${targetLabel}` : ''}, ${getIntercomRegion(origin).toUpperCase()} region: conversations, tickets, contacts, teammates and teams`,
    summarizeTest: summarizeIntercomTest,
};
