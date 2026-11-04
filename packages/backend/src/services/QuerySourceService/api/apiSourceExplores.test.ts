import {
    ApiConnectorType,
    DimensionType,
    ExploreType,
    getItemMap,
    UnexpectedServerError,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import {
    buildApiSourceExplores,
    compileApiSourceMetricQuery,
    toApiSourceResult,
} from './apiSourceExplores';
import { compileSearchConsoleQuery } from './google/searchConsoleCompiler';
import { SEARCH_CONSOLE_MAX_QUERY_ROWS } from './google/SearchConsoleConnector';

const CONNECTION_UUID = '03386598-7a51-45b2-b1f9-5ef55bd09016';

const buildOne = (
    apiSource: Parameters<typeof buildApiSourceExplores>[0]['apiSource'],
    scan: Parameters<typeof buildApiSourceExplores>[0]['scan'] = {},
): Explore => {
    const [explore, ...rest] = buildApiSourceExplores({
        connectionUuid: CONNECTION_UUID,
        name: 'Marketing site',
        apiSource,
        scan,
    });
    expect(rest).toEqual([]);
    return explore;
};

const ga4 = () =>
    buildOne({ connector: ApiConnectorType.GA4, propertyId: '123' });
const searchConsole = () =>
    buildOne({
        connector: ApiConnectorType.SEARCH_CONSOLE,
        siteUrl: 'sc-domain:example.com',
    });
const posthog = (scan = {}) =>
    buildOne({ connector: ApiConnectorType.POSTHOG, projectId: '42' }, scan);

const query = (
    explore: Explore,
    fields: { dimensions: string[]; metrics: string[] },
    overrides: Partial<MetricQuery> = {},
): MetricQuery => ({
    exploreName: explore.name,
    dimensions: fields.dimensions.map((name) => `${explore.name}_${name}`),
    metrics: fields.metrics.map((name) => `${explore.name}_${name}`),
    filters: {},
    sorts: [],
    limit: 10,
    tableCalculations: [],
    ...overrides,
});

describe('buildApiSourceExplores', () => {
    test('names each explore after its integration and connection', () => {
        expect(
            [ga4(), searchConsole(), posthog()].map(
                ({ name, label, type, apiSource }) => ({
                    name,
                    label,
                    type,
                    connectionUuid: apiSource?.connectionUuid,
                }),
            ),
        ).toEqual([
            {
                name: 'ga4_03386598_report',
                label: 'Marketing site',
                type: ExploreType.API_SOURCE,
                connectionUuid: CONNECTION_UUID,
            },
            {
                name: 'search_console_03386598_performance',
                label: 'Marketing site',
                type: ExploreType.API_SOURCE,
                connectionUuid: CONNECTION_UUID,
            },
            {
                name: 'posthog_03386598_events',
                label: 'Marketing site',
                type: ExploreType.API_SOURCE,
                connectionUuid: CONNECTION_UUID,
            },
        ]);
    });

    test('adds the fields a scan found to the base layer', () => {
        const explore = buildOne(
            { connector: ApiConnectorType.GA4, propertyId: '123' },
            {
                ga4Metadata: {
                    dimensions: [
                        {
                            apiName: 'customEvent:plan_type',
                            uiName: 'Plan type',
                            customDefinition: true,
                        },
                    ],
                },
            },
        );
        const fieldIds = Object.keys(explore.apiSource?.fields ?? {});
        expect(fieldIds).toContain(
            'ga4_03386598_report_custom_event_plan_type',
        );
        expect(fieldIds.length).toBe(
            Object.keys(ga4().apiSource?.fields ?? {}).length + 1,
        );
    });

    test('keeps the PostHog base layer when nothing was scanned', () => {
        const scanned = posthog({
            posthogProperties: {
                event: { results: [{ name: 'plan' }] },
                person: { results: [] },
            },
        });
        expect(Object.keys(scanned.apiSource?.fields ?? {})).toContain(
            'posthog_03386598_events_property_plan',
        );
        expect(Object.keys(posthog().apiSource?.fields ?? {})).not.toContain(
            'posthog_03386598_events_property_plan',
        );
    });
});

describe('compileApiSourceMetricQuery', () => {
    // 05:00 UTC is still the previous day in Pacific Time
    const now = new Date('2026-11-04T05:00:00Z');

    test('reads Search Console dates in Pacific Time, whatever the project time zone', () => {
        const explore = searchConsole();
        const metricQuery = query(explore, {
            dimensions: ['query'],
            metrics: ['clicks'],
        });
        expect(
            compileApiSourceMetricQuery({
                explore,
                metricQuery,
                timezone: 'Asia/Tokyo',
                now,
            }),
        ).toEqual(
            compileSearchConsoleQuery({
                explore,
                metricQuery,
                today: '2026-11-03',
                maxRows: SEARCH_CONSOLE_MAX_QUERY_ROWS,
            }),
        );
    });

    test('compiles each integration into its own request', () => {
        const ga4Explore = ga4();
        const posthogExplore = posthog();
        const ga4Request = JSON.parse(
            compileApiSourceMetricQuery({
                explore: ga4Explore,
                metricQuery: query(ga4Explore, {
                    dimensions: ['session_default_channel_group'],
                    metrics: ['sessions'],
                }),
                timezone: 'UTC',
                now,
            }).query,
        );
        expect(ga4Request.metrics).toEqual([{ name: 'sessions' }]);

        const { query: hogql } = compileApiSourceMetricQuery({
            explore: posthogExplore,
            metricQuery: query(posthogExplore, {
                dimensions: ['event'],
                metrics: ['event_count'],
            }),
            timezone: 'UTC',
            now,
        });
        expect(hogql).toMatch(/^SELECT .* AS c0, .* AS c1\nFROM \(/);
    });

    test('refuses an explore that is not a live data source', () => {
        const explore = { ...ga4(), apiSource: undefined };
        expect(() =>
            compileApiSourceMetricQuery({
                explore,
                metricQuery: query(explore, {
                    dimensions: [],
                    metrics: ['sessions'],
                }),
                timezone: 'UTC',
                now,
            }),
        ).toThrow(UnexpectedServerError);
    });
});

describe('toApiSourceResult', () => {
    const explore = ga4();
    const channel = `${explore.name}_session_default_channel_group`;
    const sessions = `${explore.name}_sessions`;
    const fields = getItemMap(explore);
    const compiled = {
        query: '{}',
        requestLimit: 100,
        limit: 2,
        fieldIdsByColumn: {
            sessionDefaultChannelGroup: channel,
            sessions,
        },
        localSorts: [{ fieldId: sessions, descending: true }],
    };

    test('keys rows by field id, sorts them locally with missing values last and applies the limit', () => {
        const result = toApiSourceResult({
            compiled,
            rows: [
                { sessionDefaultChannelGroup: 'Direct', sessions: 5 },
                { sessionDefaultChannelGroup: 'Email', sessions: null },
                {
                    sessionDefaultChannelGroup: 'Organic Search',
                    sessions: 9,
                    unexpected: 'dropped',
                },
            ],
            fields,
        });
        expect(result.rows).toEqual([
            { [channel]: 'Organic Search', [sessions]: 9 },
            { [channel]: 'Direct', [sessions]: 5 },
        ]);
        expect(result.columns).toEqual({
            [channel]: { reference: channel, type: DimensionType.STRING },
            [sessions]: { reference: sessions, type: DimensionType.NUMBER },
        });
    });

    test('fills columns the integration left out with null', () => {
        const { rows } = toApiSourceResult({
            compiled: { ...compiled, localSorts: [] },
            rows: [{ sessionDefaultChannelGroup: 'Direct' }],
            fields,
        });
        expect(rows).toEqual([{ [channel]: 'Direct', [sessions]: null }]);
    });
});
