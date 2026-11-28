import {
    ApiConnectorType,
    getAttioAttributesPath,
    getDefaultExplorePrefix,
    getHubspotPropertiesPath,
    getItemMap,
    getSalesforceDescribePath,
    type ExternalConnectionApiSource,
} from '@lightdash/common';
import { getGa4MetadataPath } from '../integrations/ga4/api';
import { getPostHogPropertyDefinitionsPrefix } from '../integrations/postHog/api';
import { OPPORTUNITY_DESCRIBE } from '../integrations/salesforce/salesforce.fixtures';
import { connectLiveSource } from '../liveSource.mock';
import { getLiveIntegration } from '../registry';
import { type LiveHttpRequest } from '../types';
import { buildLiveExplores } from './build';
import { getLiveFieldEditKey, type LiveSourceFieldEdits } from './fields';
import { getLiveSourceModels } from './source';

/**
 * Locks every live data source explore name and field id. Saved charts,
 * dashboard filters and scheduled deliveries store them, so a rename breaks
 * customer content. Update the snapshot only for a deliberate, additive
 * change, never to rename or remove an id. See `getLiveExploreName`.
 */

const SOURCES: {
    name: string;
    apiSource: ExternalConnectionApiSource;
    /** What the vendor answers each discovery call with, by path; `{}` otherwise. */
    answers: Record<string, unknown>;
}[] = [
    {
        name: 'Google Analytics',
        apiSource: { connector: ApiConnectorType.GA4, propertyId: '123' },
        answers: {
            [getGa4MetadataPath('123')]: {
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
        answers: {},
    },
    {
        name: 'YouTube Analytics',
        apiSource: {
            connector: ApiConnectorType.YOUTUBE_ANALYTICS,
            channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
        },
        answers: {},
    },
    {
        name: 'LinkedIn Ads',
        apiSource: {
            connector: ApiConnectorType.LINKEDIN_ADS,
            adAccountId: '507404993',
        },
        answers: {},
    },
    {
        name: 'PostHog',
        apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '42' },
        answers: {
            [`${getPostHogPropertyDefinitionsPrefix('42')}?type=event`]: {
                next: null,
                results: [{ name: 'plan' }, { name: '$browser' }],
            },
            [`${getPostHogPropertyDefinitionsPrefix('42')}?type=person`]: {
                next: null,
                results: [{ name: 'email' }],
            },
        },
    },
    {
        name: 'Meta Ads',
        apiSource: { connector: ApiConnectorType.META_ADS, adAccountId: '123' },
        answers: {},
    },
    {
        name: 'Google Ads',
        apiSource: {
            connector: ApiConnectorType.GOOGLE_ADS,
            customerId: '1234567890',
            loginCustomerId: null,
        },
        answers: {},
    },
    {
        name: 'GitHub',
        apiSource: {
            connector: ApiConnectorType.GITHUB,
            owner: 'lightdash',
            repo: 'lightdash',
        },
        answers: {},
    },
    {
        name: 'Pylon',
        apiSource: { connector: ApiConnectorType.PYLON },
        answers: {},
    },
    {
        name: 'Intercom',
        apiSource: { connector: ApiConnectorType.INTERCOM },
        answers: {},
    },
    {
        name: 'Sentry',
        apiSource: {
            connector: ApiConnectorType.SENTRY,
            organizationSlug: 'acme',
            projectSlugs: ['mobile-ios'],
        },
        answers: {},
    },
    {
        name: 'Attio',
        apiSource: { connector: ApiConnectorType.ATTIO },
        answers: {
            [getAttioAttributesPath('deals')]: {
                data: [
                    { api_slug: 'name', title: 'Deal name', type: 'text' },
                    { api_slug: 'stage', title: 'Stage', type: 'status' },
                    { api_slug: 'value', title: 'Value', type: 'currency' },
                    { api_slug: 'count', title: 'Count', type: 'number' },
                ],
            },
            [getAttioAttributesPath('people')]: {
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
    {
        name: 'HubSpot',
        apiSource: { connector: ApiConnectorType.HUBSPOT },
        answers: {
            [getHubspotPropertiesPath('deals')]: {
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
            [getHubspotPropertiesPath('contacts')]: {
                results: [{ name: 'email', label: 'Email', type: 'string' }],
            },
        },
    },
    {
        name: 'Salesforce',
        apiSource: { connector: ApiConnectorType.SALESFORCE },
        answers: {
            [getSalesforceDescribePath('Opportunity')]: OPPORTUNITY_DESCRIBE,
            [getSalesforceDescribePath('Lead')]: {
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
];

/** Answers every call by its path, and the type it asks for when it names one. */
const answerBy =
    (answers: Record<string, unknown>) => async (request: LiveHttpRequest) => {
        const type = request.query?.type;
        const key = type ? `${request.path}?type=${type}` : request.path;
        return {
            status: 200,
            headers: {},
            body: Object.hasOwn(answers, key) ? answers[key] : {},
        };
    };

describe('live data source names', () => {
    test.each(SOURCES)(
        '$name explore names and field ids never change',
        async ({ name, apiSource, answers }) => {
            const sourceName = getDefaultExplorePrefix(
                apiSource.connector,
                name,
            );
            const metadata = await connectLiveSource(
                getLiveIntegration(apiSource.connector),
                apiSource,
                answerBy(answers),
            ).scan();
            const state = {
                scan: { at: '2026-01-01T00:00:00Z', metadata },
                modelNames: {},
            };
            // Every field in use, so the snapshot holds every id a chart can store
            const everyFieldInUse: LiveSourceFieldEdits = Object.fromEntries(
                getLiveSourceModels(apiSource.connector, state).flatMap(
                    ({ editModel, definition }) =>
                        [...definition.dimensions, ...definition.metrics].map(
                            (field) => [
                                getLiveFieldEditKey(editModel, field.name),
                                { inUse: true, lastEdit: null },
                            ],
                        ),
                ),
            );
            const built = buildLiveExplores({
                connectionUuid: '03386598-7a51-45b2-b1f9-5ef55bd09016',
                sourceName,
                name,
                apiSource,
                state: { ...state, fields: everyFieldInUse, explores: {} },
            });

            expect({
                explores: built.map((explore) => ({
                    name: explore.name,
                    fieldIds: Object.keys(getItemMap(explore)).sort(),
                })),
            }).toMatchSnapshot();
        },
    );
});
