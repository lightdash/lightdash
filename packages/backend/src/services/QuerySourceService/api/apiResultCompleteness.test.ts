import {
    ApiConnectorType,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import {
    buildApiSourceExplores,
    compileApiSourceMetricQuery,
    getApiResultCompleteness,
    getLegacyLiveSourceName,
    toScannedLiveSourceFields,
} from './apiSourceExplores';
import { getInitialLiveSourceFieldEdits } from './liveSourceFields';

const CONNECTION_UUID = '03386598-7a51-45b2-b1f9-5ef55bd09016';

const build = (
    apiSource: Parameters<typeof buildApiSourceExplores>[0]['apiSource'],
): Explore => {
    const scannedFields = toScannedLiveSourceFields(apiSource.connector, {});
    const [explore] = buildApiSourceExplores({
        connectionUuid: CONNECTION_UUID,
        sourceName: getLegacyLiveSourceName(
            apiSource.connector,
            CONNECTION_UUID,
        ),
        name: 'Source',
        apiSource,
        scannedFields,
        edits: getInitialLiveSourceFieldEdits({
            scannedFields,
            isExistingSource: true,
        }),
    });
    return explore;
};

const query = (
    explore: Explore,
    fields: { dimension: string; metric: string },
    sorts: MetricQuery['sorts'],
): MetricQuery => ({
    exploreName: explore.name,
    dimensions: [`${explore.name}_${fields.dimension}`],
    metrics: [`${explore.name}_${fields.metric}`],
    filters: {},
    sorts: sorts.map((sort) => ({
        ...sort,
        fieldId: `${explore.name}_${sort.fieldId}`,
    })),
    limit: 10,
    tableCalculations: [],
});

const completeness = (
    explore: Explore,
    metricQuery: MetricQuery,
    hasMoreRows: boolean,
) =>
    getApiResultCompleteness({
        compiled: compileApiSourceMetricQuery({
            explore,
            metricQuery,
            timezone: 'UTC',
            now: new Date('2026-11-04T12:00:00Z'),
        }),
        hasMoreRows,
    });

/**
 * Each integration with the query it reads in the API's own order, and, where
 * the API can't sort by a field, one it has to sort on our side.
 */
const integrations: {
    name: string;
    explore: () => Explore;
    fields: { dimension: string; metric: string };
    apiOrder: MetricQuery['sorts'];
    localOrder: MetricQuery['sorts'] | null;
}[] = [
    {
        name: 'Search Console',
        explore: () =>
            build({
                connector: ApiConnectorType.SEARCH_CONSOLE,
                siteUrl: 'sc-domain:example.com',
            }),
        fields: { dimension: 'query', metric: 'clicks' },
        apiOrder: [{ fieldId: 'clicks', descending: true }],
        localOrder: [{ fieldId: 'impressions', descending: false }],
    },
    {
        name: 'GA4',
        explore: () =>
            build({ connector: ApiConnectorType.GA4, propertyId: '123' }),
        fields: {
            dimension: 'session_default_channel_group',
            metric: 'sessions',
        },
        apiOrder: [{ fieldId: 'sessions', descending: false }],
        localOrder: null,
    },
    {
        name: 'PostHog',
        explore: () =>
            build({ connector: ApiConnectorType.POSTHOG, projectId: '42' }),
        fields: { dimension: 'event', metric: 'event_count' },
        apiOrder: [{ fieldId: 'event_count', descending: false }],
        localOrder: null,
    },
    {
        name: 'Google Ads',
        explore: () =>
            build({
                connector: ApiConnectorType.GOOGLE_ADS,
                customerId: '123',
                loginCustomerId: null,
            }),
        fields: { dimension: 'campaign_name', metric: 'clicks' },
        apiOrder: [{ fieldId: 'clicks', descending: false }],
        localOrder: null,
    },
    {
        name: 'YouTube Analytics',
        explore: () =>
            build({
                connector: ApiConnectorType.YOUTUBE_ANALYTICS,
                channelId: 'UC123',
            }),
        fields: { dimension: 'date', metric: 'views' },
        apiOrder: [{ fieldId: 'views', descending: true }],
        localOrder: null,
    },
    {
        name: 'LinkedIn Ads',
        explore: () =>
            build({
                connector: ApiConnectorType.LINKEDIN_ADS,
                adAccountId: '456',
            }),
        fields: { dimension: 'campaign_name', metric: 'impressions' },
        apiOrder: [],
        localOrder: [{ fieldId: 'impressions', descending: true }],
    },
    {
        name: 'Meta Ads',
        explore: () =>
            build({
                connector: ApiConnectorType.META_ADS,
                adAccountId: '789',
            }),
        fields: { dimension: 'campaign_name', metric: 'impressions' },
        apiOrder: [{ fieldId: 'impressions', descending: false }],
        localOrder: [{ fieldId: 'campaign_name', descending: false }],
    },
];

describe.each(integrations)(
    '$name result completeness',
    ({ explore, fields, apiOrder, localOrder }) => {
        test('is complete when the API has no more rows', () => {
            const source = explore();
            expect(
                completeness(source, query(source, fields, apiOrder), false),
            ).toBe('complete');
        });

        test('more rows in the API order are past its own limit', () => {
            const source = explore();
            expect(
                completeness(source, query(source, fields, apiOrder), true),
            ).toBe('own_limit');
        });

        if (localOrder) {
            test('more rows under a sort on our side are a source cut', () => {
                const source = explore();
                expect(
                    completeness(
                        source,
                        query(source, fields, localOrder),
                        true,
                    ),
                ).toBe('source_cut');
            });

            test('a sort on our side is complete when the API has no more rows', () => {
                const source = explore();
                expect(
                    completeness(
                        source,
                        query(source, fields, localOrder),
                        false,
                    ),
                ).toBe('complete');
            });
        }
    },
);

test('Search Console grouped by date is a source cut when sorted', () => {
    const source = integrations[0].explore();
    const metricQuery = query(source, { dimension: 'date', metric: 'clicks' }, [
        { fieldId: 'clicks', descending: true },
    ]);
    expect(completeness(source, metricQuery, true)).toBe('source_cut');
});
