import {
    ApiConnectorType,
    getHubspotPipelinesPath,
    getHubspotPropertiesPath,
    getHubspotSearchPath,
    HUBSPOT_OBJECTS,
    HUBSPOT_ORIGIN,
    HUBSPOT_PIPELINE_OBJECTS,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    formatTestCount,
    readRule,
    type LiveConnection,
    type LiveTestSummary,
} from '../../sdk';

// The setup test lists the object's properties
const testResponseSchema = z.object({ results: z.array(z.unknown()) });

/** The setup test reads the deals' properties, the source's main explore. */
export const summarizeHubspotTest = (body: unknown): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: 'Connected to your HubSpot account',
        facts: [
            {
                label: 'Deal properties',
                value: formatTestCount(parsed.data.results.length),
            },
        ],
    };
};

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.HUBSPOT];

export const hubspotConnection: LiveConnection<ApiConnectorType.HUBSPOT> = {
    settings: CATALOG.settings,
    origins: [HUBSPOT_ORIGIN],
    access: () => ({
        rules: [
            ...HUBSPOT_OBJECTS.flatMap((object) => [
                readRule('GET', getHubspotPropertiesPath(object)),
                readRule('POST', getHubspotSearchPath(object)),
            ]),
            ...HUBSPOT_PIPELINE_OBJECTS.map((object) =>
                readRule('GET', getHubspotPipelinesPath(object)),
            ),
        ],
    }),
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'HubSpot live data sources authenticate with a private app access token',
            );
        }
    },
    describeTarget: () =>
        'HubSpot CRM: deals, contacts, companies, tickets and leads, plus deal and ticket pipeline stages',
    summarizeTest: summarizeHubspotTest,
};
