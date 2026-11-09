import {
    ApiConnectorType,
    getItemMap,
    type ExternalConnectionApiSource,
} from '@lightdash/common';
import {
    buildApiSourceExplores,
    getApiSourceBaseLayer,
    getApiSourceReservedExploreNames,
    getLiveSourceNameBase,
    toScannedLiveSourceFields,
} from './apiSourceExplores';
import { type ApiSourceScan } from './ApiSourceIntegration';
import { type LiveSourceFieldEdits } from './liveSourceFields';

/**
 * Locks every live data source explore name and field id. Saved charts,
 * dashboard filters and scheduled deliveries store them, so a rename breaks
 * customer content. Update the snapshot only for a deliberate, additive
 * change, never to rename or remove an id. See `getApiSourceExploreName`.
 */

const SOURCES: {
    name: string;
    apiSource: ExternalConnectionApiSource;
    scan: ApiSourceScan;
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
];

describe('live data source names', () => {
    test.each(SOURCES)(
        '$name explore names and field ids never change',
        ({ name, apiSource, scan }) => {
            const sourceName = getLiveSourceNameBase(apiSource.connector, name);
            const scannedFields = toScannedLiveSourceFields(
                apiSource.connector,
                scan,
            );
            // Every field in use, so the snapshot holds every id a chart can store
            const { definitions } = getApiSourceBaseLayer(apiSource.connector);
            const everyFieldInUse: LiveSourceFieldEdits = Object.fromEntries(
                [
                    ...definitions.flatMap((definition) => [
                        ...definition.dimensions,
                        ...definition.metrics,
                    ]),
                    ...scannedFields.map((field) => field.definition),
                ].map((field) => [field.name, { inUse: true, lastEdit: null }]),
            );
            const explores = buildApiSourceExplores({
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
                reservedExploreNames: getApiSourceReservedExploreNames(
                    apiSource.connector,
                    sourceName,
                ),
            }).toMatchSnapshot();
        },
    );
});
