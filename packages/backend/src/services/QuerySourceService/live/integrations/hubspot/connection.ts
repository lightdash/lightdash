import {
    ApiConnectorType,
    getHubspotPipelinesPath,
    getHubspotPropertiesPath,
    getHubspotSearchPath,
    HUBSPOT_OBJECTS,
    HUBSPOT_ORIGIN,
    HUBSPOT_PIPELINE_OBJECTS,
    HUBSPOT_SCHEMAS_PATH,
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
import { HUBSPOT_CUSTOM_OBJECT_ID } from './api';

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
    access: (_settings, explores) => ({
        rules: [
            ...HUBSPOT_OBJECTS.flatMap((object) => [
                readRule('GET', getHubspotPropertiesPath(object)),
                readRule('POST', getHubspotSearchPath(object)),
            ]),
            ...HUBSPOT_PIPELINE_OBJECTS.map((object) =>
                readRule('GET', getHubspotPipelinesPath(object)),
            ),
            readRule('GET', HUBSPOT_SCHEMAS_PATH, { exact: true }),
            // Each custom object the last Refresh found is searched by its id
            ...explores.flatMap(({ apiName }) =>
                apiName !== undefined && HUBSPOT_CUSTOM_OBJECT_ID.test(apiName)
                    ? [
                          readRule('POST', getHubspotSearchPath(apiName), {
                              exact: true,
                              entry: apiName,
                          }),
                      ]
                    : [],
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
        'HubSpot CRM: deals, contacts, companies, tickets and leads, plus deal and ticket pipeline stages and custom objects',
    summarizeTest: summarizeHubspotTest,
};
