import {
    ApiConnectorType,
    DimensionType,
    ExploreType,
    FilterOperator,
    getItemMap,
    UnexpectedServerError,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import {
    buildApiSourceExplores,
    compileApiSourceMetricQuery,
    getApiSourceExploreNames,
    getLegacyLiveSourceName,
    getLiveSourceNameBase,
    toApiSourceResult,
    toPeriodStart,
    toScannedLiveSourceFields,
    type ApiSourceScan,
} from './apiSourceExplores';
import { compileSearchConsoleQuery } from './google/searchConsoleCompiler';
import { SEARCH_CONSOLE_MAX_QUERY_ROWS } from './google/SearchConsoleConnector';
import { getInitialLiveSourceFieldEdits } from './liveSourceFields';

const CONNECTION_UUID = '03386598-7a51-45b2-b1f9-5ef55bd09016';

const buildOne = (
    apiSource: Parameters<typeof buildApiSourceExplores>[0]['apiSource'],
    scan: ApiSourceScan = {},
): Explore => {
    const scannedFields = toScannedLiveSourceFields(apiSource.connector, scan);
    const [explore, ...rest] = buildApiSourceExplores({
        connectionUuid: CONNECTION_UUID,
        sourceName: getLegacyLiveSourceName(
            apiSource.connector,
            CONNECTION_UUID,
        ),
        name: 'Marketing site',
        apiSource,
        scannedFields,
        edits: getInitialLiveSourceFieldEdits({
            scannedFields,
            isExistingSource: true,
        }),
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

describe('live source names', () => {
    test('a stored source name prefixes every explore of the source', () => {
        const [explore] = buildApiSourceExplores({
            connectionUuid: CONNECTION_UUID,
            sourceName: 'posthog',
            name: 'PostHog',
            apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '42' },
            scannedFields: [],
            edits: {},
        });
        expect(explore.name).toBe('posthog_events');
        expect(
            getApiSourceExploreNames(ApiConnectorType.POSTHOG, 'posthog'),
        ).toEqual(['posthog_events']);
    });

    test('a new name comes from the source name, as a lowercase identifier', () => {
        expect(
            getLiveSourceNameBase(ApiConnectorType.GA4, 'Google Analytics'),
        ).toBe('google_analytics');
        expect(
            getLiveSourceNameBase(
                ApiConnectorType.POSTHOG,
                'Product analytics',
            ),
        ).toBe('product_analytics');
    });

    test('a name that is no identifier falls back to the integration', () => {
        expect(
            getLiveSourceNameBase(ApiConnectorType.POSTHOG, '2024 events'),
        ).toBe('posthog');
    });

    test('sources from before stored names keep their id-based name', () => {
        expect(
            getLegacyLiveSourceName(
                ApiConnectorType.SEARCH_CONSOLE,
                CONNECTION_UUID,
            ),
        ).toBe('search_console_03386598');
    });
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

    test("starts PostHog's current week on Monday, like its week field", () => {
        vi.useFakeTimers();
        // Wednesday 4 November 2026
        vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
        try {
            const explore = posthog();
            const { query: hogql } = compileApiSourceMetricQuery({
                explore,
                metricQuery: query(
                    explore,
                    { dimensions: ['event'], metrics: ['event_count'] },
                    {
                        filters: {
                            dimensions: {
                                id: 'root',
                                and: [
                                    {
                                        id: 'current-week',
                                        target: {
                                            fieldId: `${explore.name}_date`,
                                        },
                                        operator: FilterOperator.IN_THE_CURRENT,
                                        values: [1],
                                        settings: { unitOfTime: 'weeks' },
                                    },
                                ],
                            },
                        },
                    },
                ),
                timezone: 'UTC',
                now: new Date(),
            });
            expect(hogql).toContain('2026-11-02');
            expect(hogql).not.toContain('2026-11-01');
            expect(hogql).not.toContain('INTERVAL 30 DAY');
        } finally {
            vi.useRealTimers();
        }
    });

    test('refuses a field the source scanned but has not put in use', () => {
        const apiSource = {
            connector: ApiConnectorType.POSTHOG,
            projectId: '42',
        } as const;
        const scannedFields = toScannedLiveSourceFields(apiSource.connector, {
            posthogProperties: {
                event: { results: [{ name: 'plan' }] },
                person: { results: [] },
            },
        });
        const [explore] = buildApiSourceExplores({
            connectionUuid: CONNECTION_UUID,
            sourceName: 'posthog',
            name: 'PostHog',
            apiSource,
            scannedFields,
            edits: getInitialLiveSourceFieldEdits({
                scannedFields,
                isExistingSource: false,
            }),
        });
        const plan = `${explore.name}_property_plan`;
        const event = `${explore.name}_event`;
        expect(Object.keys(getItemMap(explore))).not.toContain(plan);

        const compile = (overrides: Partial<MetricQuery>) => () =>
            compileApiSourceMetricQuery({
                explore,
                metricQuery: query(
                    explore,
                    { dimensions: ['event'], metrics: ['event_count'] },
                    overrides,
                ),
                timezone: 'UTC',
                now,
            });
        const refusal = `"${plan}" isn't available from this live data source.`;
        expect(compile({ dimensions: [event, plan] })).toThrow(refusal);
        expect(
            compile({
                filters: {
                    dimensions: {
                        id: 'filters',
                        and: [
                            {
                                id: 'plan-is-pro',
                                target: { fieldId: plan },
                                operator: FilterOperator.EQUALS,
                                values: ['pro'],
                            },
                        ],
                    },
                },
            }),
        ).toThrow(refusal);
        expect(
            compile({ sorts: [{ fieldId: plan, descending: false }] }),
        ).toThrow(refusal);
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

    test('turns compact GA4 periods into the first day of the period', () => {
        const month = `${explore.name}_date_month`;
        const { rows, columns } = toApiSourceResult({
            compiled: {
                ...compiled,
                fieldIdsByColumn: { yearMonth: month, sessions },
                localSorts: [],
                periodColumns: { yearMonth: 'year_month' },
            },
            rows: [{ yearMonth: '202610', sessions: 3 }],
            fields,
        });
        expect(rows).toEqual([{ [month]: '2026-10-01', [sessions]: 3 }]);
        expect(columns[month]).toEqual({
            reference: month,
            type: DimensionType.DATE,
        });
    });
});

describe('toPeriodStart', () => {
    test.each([
        ['2026', 'year', '2026-01-01'],
        ['202610', 'year_month', '2026-10-01'],
        // ISO week 1 of 2026 starts on Monday 29 December 2025
        ['202601', 'iso_week', '2025-12-29'],
        ['202645', 'iso_week', '2026-11-02'],
        ['202053', 'iso_week', '2020-12-28'],
        ['(other)', 'iso_week', '(other)'],
    ] as const)('reads %s as a %s starting %s', (value, format, expected) => {
        expect(toPeriodStart(value, format)).toBe(expected);
    });
});
