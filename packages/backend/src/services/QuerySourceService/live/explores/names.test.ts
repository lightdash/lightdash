import {
    ApiConnectorType,
    getDefaultExplorePrefix,
    getItemMap,
    type ExternalConnectionApiSource,
} from '@lightdash/common';
import { OPPORTUNITY_DESCRIBE } from '../integrations/salesforce/salesforce.fixtures';
import { type LiveCatalog } from '../types';
import {
    buildLiveExplores,
    getLiveBaseLayer,
    getLiveReservedExploreNames,
    toScannedLiveSourceFields,
} from './build';
import { getLiveFieldEditKey, type LiveSourceFieldEdits } from './fields';

/**
 * Locks every live data source explore name and field id. Saved charts,
 * dashboard filters and scheduled deliveries store them, so a rename breaks
 * customer content. Update the snapshot only for a deliberate, additive
 * change, never to rename or remove an id. See `getLiveExploreName`.
 */

const SOURCES: {
    name: string;
    apiSource: ExternalConnectionApiSource;
    scan: LiveCatalog;
}[] = [
    {
        name: 'Google Analytics',
        apiSource: { connector: ApiConnectorType.GA4, propertyId: '123' },
        scan: {
            ga4Metadata: {
                dimensions: [
                    {
                        apiName: 'customEvent:plan_type',
                        customDefinition: true,
                    },
                    {
                        apiName: 'customUser:accountTier',
                        customDefinition: true,
                    },
                ],
                metrics: [
                    {
                        apiName: 'customEvent:order_value',
                        customDefinition: true,
                    },
                    { apiName: 'keyEvents:sign_up' },
                ],
            },
        },
    },
    {
        name: 'Search Console',
        apiSource: {
            connector: ApiConnectorType.SEARCH_CONSOLE,
            siteUrl: 'sc-domain:example.com',
        },
        scan: {},
    },
    {
        name: 'YouTube Analytics',
        apiSource: {
            connector: ApiConnectorType.YOUTUBE_ANALYTICS,
            channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
        },
        scan: {},
    },
    {
        name: 'LinkedIn Ads',
        apiSource: {
            connector: ApiConnectorType.LINKEDIN_ADS,
            adAccountId: '507404993',
        },
        scan: {},
    },
    {
        name: 'PostHog',
        apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '42' },
        scan: {
            posthogProperties: {
                event: { results: [{ name: 'plan' }, { name: '$browser' }] },
                person: { results: [{ name: 'email' }] },
            },
        },
    },
    {
        name: 'Meta Ads',
        apiSource: { connector: ApiConnectorType.META_ADS, adAccountId: '123' },
        scan: {},
    },
    {
        name: 'Google Ads',
        apiSource: {
            connector: ApiConnectorType.GOOGLE_ADS,
            customerId: '1234567890',
            loginCustomerId: null,
        },
        scan: {},
    },
    {
        name: 'GitHub',
        apiSource: {
            connector: ApiConnectorType.GITHUB,
            owner: 'lightdash',
            repo: 'lightdash',
        },
        scan: {},
    },
    {
        name: 'Pylon',
        apiSource: { connector: ApiConnectorType.PYLON },
        scan: {},
    },
    {
        name: 'Intercom',
        apiSource: { connector: ApiConnectorType.INTERCOM },
        scan: {},
    },
    {
        name: 'Sentry',
        apiSource: {
            connector: ApiConnectorType.SENTRY,
            organizationSlug: 'acme',
            projectSlugs: ['mobile-ios'],
        },
        scan: {},
    },
    {
        name: 'Attio',
        apiSource: { connector: ApiConnectorType.ATTIO },
        scan: {
            attioAttributes: {
                deals: {
                    data: [
                        { api_slug: 'name', title: 'Deal name', type: 'text' },
                        { api_slug: 'stage', title: 'Stage', type: 'status' },
                        { api_slug: 'value', title: 'Value', type: 'currency' },
                        { api_slug: 'count', title: 'Count', type: 'number' },
                    ],
                },
                people: {
                    data: [
                        {
                            api_slug: 'email_addresses',
                            title: 'Email addresses',
                            type: 'email-address',
                        },
                    ],
                },
            },
        },
    },
    {
        name: 'HubSpot',
        apiSource: { connector: ApiConnectorType.HUBSPOT },
        scan: {
            hubspotProperties: {
                deals: {
                    results: [
                        {
                            name: 'dealname',
                            label: 'Deal Name',
                            type: 'string',
                        },
                        {
                            name: 'dealstage',
                            label: 'Stage',
                            type: 'enumeration',
                        },
                        { name: 'amount', label: 'Amount', type: 'number' },
                        { name: 'count', label: 'Count', type: 'number' },
                    ],
                },
                contacts: {
                    results: [
                        { name: 'email', label: 'Email', type: 'string' },
                    ],
                },
            },
        },
    },
    {
        name: 'Salesforce',
        apiSource: { connector: ApiConnectorType.SALESFORCE },
        scan: {
            salesforceDescribe: {
                Opportunity: OPPORTUNITY_DESCRIBE,
                Lead: {
                    name: 'Lead',
                    fields: [
                        {
                            name: 'Company',
                            label: 'Company',
                            type: 'string',
                            groupable: true,
                            filterable: true,
                        },
                    ],
                },
            },
        },
    },
];

describe('live data source names', () => {
    test.each(SOURCES)(
        '$name explore names and field ids never change',
        ({ name, apiSource, scan }) => {
            const sourceName = getDefaultExplorePrefix(
                apiSource.connector,
                name,
            );
            const scannedFields = toScannedLiveSourceFields(
                apiSource.connector,
                scan,
            );
            // Every field in use, so the snapshot holds every id a chart can store
            const { definitions } = getLiveBaseLayer(apiSource.connector);
            const everyFieldInUse: LiveSourceFieldEdits = Object.fromEntries(
                [
                    ...definitions.flatMap((definition) =>
                        [...definition.dimensions, ...definition.metrics].map(
                            ({ name: fieldName }) => fieldName,
                        ),
                    ),
                    ...scannedFields.map((field) =>
                        getLiveFieldEditKey(
                            field.model ?? null,
                            field.definition.name,
                        ),
                    ),
                ].map((key) => [key, { inUse: true, lastEdit: null }]),
            );
            const explores = buildLiveExplores({
                connectionUuid: '03386598-7a51-45b2-b1f9-5ef55bd09016',
                sourceName,
                name,
                apiSource,
                scannedFields,
                edits: everyFieldInUse,
            });

            expect({
                explores: explores.map((explore) => ({
                    name: explore.name,
                    fieldIds: Object.keys(getItemMap(explore)).sort(),
                })),
                reservedExploreNames: getLiveReservedExploreNames(
                    apiSource.connector,
                    sourceName,
                ),
            }).toMatchSnapshot();
        },
    );
});
