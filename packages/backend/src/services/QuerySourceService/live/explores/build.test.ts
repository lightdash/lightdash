import {
    ApiConnectorType,
    DimensionType,
    ExploreType,
    FilterOperator,
    getDefaultExplorePrefix,
    getItemMap,
    getLegacyLiveSourceName,
    MetricType,
    UnexpectedServerError,
    type Explore,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { compileSearchConsoleQuery } from '../integrations/searchConsole/compile';
import { SEARCH_CONSOLE_MAX_QUERY_ROWS } from '../integrations/searchConsole/run';
import { type LiveScanResult } from '../types';
import {
    buildLiveExplores,
    compileLiveMetricQuery,
    describeLiveTarget,
    findSwitchedOffLiveExplore,
    getLiveDefinitionHashes,
    getLiveExploreNames,
    getLostLiveFieldIds,
    toLiveResult,
    toPeriodStart,
    toScannedLiveSourceFields,
} from './build';
import { assertLiveQuery, getLiveDefinitionName } from './definition';
import {
    getInitialLiveSourceFieldEdits,
    type LiveSourceExploreEdits,
} from './fields';

const CONNECTION_UUID = '03386598-7a51-45b2-b1f9-5ef55bd09016';

const buildOne = (
    apiSource: Parameters<typeof buildLiveExplores>[0]['apiSource'],
    scan: LiveScanResult = {},
): Explore => {
    const scannedFields = toScannedLiveSourceFields(apiSource.connector, scan);
    const [explore, ...rest] = buildLiveExplores({
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
        const [explore] = buildLiveExplores({
            connectionUuid: CONNECTION_UUID,
            sourceName: 'posthog',
            name: 'PostHog',
            apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '42' },
            scannedFields: [],
            edits: {},
        });
        expect(explore.name).toBe('posthog_events');
        expect(
            getLiveExploreNames(ApiConnectorType.POSTHOG, 'posthog'),
        ).toEqual(['posthog_events']);
    });

    test('a new name comes from the source name, as a lowercase identifier', () => {
        expect(
            getDefaultExplorePrefix(ApiConnectorType.GA4, 'Google Analytics'),
        ).toBe('google_analytics');
        expect(
            getDefaultExplorePrefix(
                ApiConnectorType.POSTHOG,
                'Product analytics',
            ),
        ).toBe('product_analytics');
    });

    test('a name that is no identifier falls back to the integration', () => {
        expect(
            getDefaultExplorePrefix(ApiConnectorType.POSTHOG, '2024 events'),
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

describe('buildLiveExplores', () => {
    test('reads back which definition an explore was built from', () => {
        expect(
            [ga4(), searchConsole()].map((explore) =>
                getLiveDefinitionName(explore),
            ),
        ).toEqual(['report', 'performance']);
    });

    test('names each explore after its model, under its source', () => {
        expect(
            [ga4(), searchConsole(), posthog()].map(
                ({ name, label, groupLabel, type, apiSource }) => ({
                    name,
                    label,
                    groupLabel,
                    type,
                    connectionUuid: apiSource?.connectionUuid,
                }),
            ),
        ).toEqual([
            {
                name: 'ga4_03386598_report',
                label: 'Report',
                groupLabel: 'Marketing site',
                type: ExploreType.API_SOURCE,
                connectionUuid: CONNECTION_UUID,
            },
            {
                name: 'search_console_03386598_performance',
                label: 'Search performance',
                groupLabel: 'Marketing site',
                type: ExploreType.API_SOURCE,
                connectionUuid: CONNECTION_UUID,
            },
            {
                name: 'posthog_03386598_events',
                label: 'Events',
                groupLabel: 'Marketing site',
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

describe('switching explores off and editing them', () => {
    const hydra = (exploreEdits: LiveSourceExploreEdits) =>
        buildLiveExplores({
            connectionUuid: CONNECTION_UUID,
            sourceName: 'hydra',
            name: 'Hydra',
            apiSource: { connector: ApiConnectorType.HYDRA },
            scannedFields: [],
            edits: {},
            exploreEdits,
            aiHint: ['Hydra target', 'Source hint'],
        });

    it('builds every explore unless it is switched off', () => {
        expect(hydra({}).map(({ name }) => name)).toEqual([
            'hydra_events',
            'hydra_users',
        ]);
        expect(
            hydra({ events: { inUse: false } }).map(({ name }) => name),
        ).toEqual(['hydra_users']);
        expect(
            hydra({ events: { inUse: false }, users: { inUse: false } }),
        ).toEqual([]);
    });

    it('applies label and description overrides, and adds the explore hint last', () => {
        const [, users] = hydra({
            users: {
                label: 'Customers',
                description: 'Paying users',
                aiHint: 'Seats are per workspace',
            },
        });
        expect(users.label).toBe('Customers');
        expect(users.tables[users.baseTable].description).toBe('Paying users');
        expect(users.aiHint).toEqual([
            'Hydra target',
            'Source hint',
            'Seats are per workspace',
        ]);
        expect(users.apiSource?.definitionHash).toBe(
            hydra({}).at(1)?.apiSource?.definitionHash,
        );
    });
});

describe('findSwitchedOffLiveExplore', () => {
    const source = (exploreEdits: LiveSourceExploreEdits) => ({
        name: 'Product Hydra',
        sourceName: 'hydra',
        connector: ApiConnectorType.HYDRA,
        exploreEdits,
    });

    it('names the source and explore of a switched-off explore', () => {
        expect(
            findSwitchedOffLiveExplore(
                [source({ events: { inUse: false } })],
                'hydra_events',
            ),
        ).toEqual({ sourceName: 'Product Hydra', exploreLabel: 'Events' });
        expect(
            findSwitchedOffLiveExplore(
                [source({ events: { inUse: false, label: 'Activity' } })],
                'hydra_events',
            ),
        ).toEqual({ sourceName: 'Product Hydra', exploreLabel: 'Activity' });
    });

    it('finds nothing for an explore that is on, or not a live explore', () => {
        const sources = [source({ events: { inUse: false } })];
        expect(findSwitchedOffLiveExplore(sources, 'hydra_users')).toBe(
            undefined,
        );
        expect(findSwitchedOffLiveExplore(sources, 'orders')).toBe(undefined);
        expect(findSwitchedOffLiveExplore([source({})], 'hydra_events')).toBe(
            undefined,
        );
    });
});

describe('compileLiveMetricQuery', () => {
    // 05:00 UTC is still the previous day in Pacific Time
    const now = new Date('2026-11-04T05:00:00Z');

    test('reads Search Console dates in Pacific Time, whatever the project time zone', () => {
        const explore = searchConsole();
        const metricQuery = query(explore, {
            dimensions: ['query'],
            metrics: ['clicks'],
        });
        expect(
            compileLiveMetricQuery({
                explore,
                metricQuery,
                timezone: 'Asia/Tokyo',
                now,
            }).query,
        ).toEqual(
            compileSearchConsoleQuery({
                explore,
                metricQuery,
                today: '2026-11-03',
                maxRows: SEARCH_CONSOLE_MAX_QUERY_ROWS,
            }).query,
        );
    });

    test('compiles each integration into its own request', () => {
        const ga4Explore = ga4();
        const posthogExplore = posthog();
        const ga4Request = JSON.parse(
            compileLiveMetricQuery({
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

        const { query: hogql } = compileLiveMetricQuery({
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
            const { query: hogql } = compileLiveMetricQuery({
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
        const [explore] = buildLiveExplores({
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
            assertLiveQuery(
                explore,
                query(
                    explore,
                    { dimensions: ['event'], metrics: ['event_count'] },
                    overrides,
                ),
            );
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
            compileLiveMetricQuery({
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

describe('toLiveResult', () => {
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
        const result = toLiveResult({
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
        const { rows } = toLiveResult({
            compiled: { ...compiled, localSorts: [] },
            rows: [{ sessionDefaultChannelGroup: 'Direct' }],
            fields,
        });
        expect(rows).toEqual([{ [channel]: 'Direct', [sessions]: null }]);
    });

    test('turns compact GA4 periods into the first day of the period', () => {
        const month = `${explore.name}_date_month`;
        const { rows, columns } = toLiveResult({
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

describe('toLiveResult metric types', () => {
    test('types a minimum or maximum of a date as that date type', () => {
        const explore = ga4();
        const date = `${explore.name}_date`;
        const latest = `${explore.name}_latest_date`;
        const fields = {
            ...getItemMap(explore),
            [latest]: {
                ...getItemMap(explore)[`${explore.name}_sessions`],
                name: 'latest_date',
                type: MetricType.MAX,
                dimensionReference: date,
            },
        } as ItemsMap;
        const { columns } = toLiveResult({
            compiled: {
                query: '{}',
                requestLimit: 10,
                limit: 10,
                fieldIdsByColumn: {
                    latest,
                    sessions: `${explore.name}_sessions`,
                },
                localSorts: [],
            },
            rows: [{ latest: '2026-11-01', sessions: 3 }],
            fields,
        });
        expect(columns[latest].type).toBe(
            (fields[date] as { type: DimensionType }).type,
        );
        expect(columns[`${explore.name}_sessions`].type).toBe(
            DimensionType.NUMBER,
        );
    });

    test('types a custom maximum of a timestamp as a timestamp', () => {
        const explore = ga4();
        const sessions = `${explore.name}_sessions`;
        const lastSeen = `${explore.name}_last_seen`;
        const fields = {
            ...getItemMap(explore),
            [lastSeen]: {
                ...getItemMap(explore)[sessions],
                name: 'last_seen',
                type: MetricType.MAX,
                baseDimensionType: DimensionType.TIMESTAMP,
            },
        } as ItemsMap;
        const { columns } = toLiveResult({
            compiled: {
                query: '{}',
                requestLimit: 10,
                limit: 10,
                fieldIdsByColumn: { lastSeen },
                localSorts: [],
            },
            rows: [{ lastSeen: '2026-11-01T10:00:00Z' }],
            fields,
        });
        expect(columns[lastSeen].type).toBe(DimensionType.TIMESTAMP);
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

describe('definition hashes', () => {
    const scan: LiveScanResult = {};
    const build = (sourceName: string, name: string) =>
        buildLiveExplores({
            connectionUuid: CONNECTION_UUID,
            sourceName,
            name,
            apiSource: {
                connector: ApiConnectorType.SEARCH_CONSOLE,
                siteUrl: 'sc-domain:example.com',
            },
            scannedFields: toScannedLiveSourceFields(
                ApiConnectorType.SEARCH_CONSOLE,
                scan,
            ),
            edits: {},
        });

    it.each(Object.values(ApiConnectorType))(
        'hashes %s from code alone, the same for every source',
        (connector) => {
            const hashes = getLiveDefinitionHashes(connector);
            expect(Object.values(hashes).length).toBeGreaterThan(0);
            Object.values(hashes).forEach((hash) =>
                expect(hash).toMatch(/^[0-9a-f]{64}$/),
            );
        },
    );

    it('stores the same hash whatever the prefix or label', () => {
        const [first] = build('marketing', 'Marketing site');
        const [second] = build('docs', 'Docs site');
        expect(first.apiSource?.definitionHash).toBe(
            second.apiSource?.definitionHash,
        );
        expect(first.apiSource?.definitionHash).toBe(
            Object.values(
                getLiveDefinitionHashes(ApiConnectorType.SEARCH_CONSOLE),
            )[0],
        );
    });

    it('stores the same hash when a field edit changes the explore', () => {
        const apiSource = {
            connector: ApiConnectorType.SEARCH_CONSOLE,
            siteUrl: 'sc-domain:example.com',
        } as const;
        const [plain] = build('site', 'Site');
        const [edited] = buildLiveExplores({
            connectionUuid: CONNECTION_UUID,
            sourceName: 'site',
            name: 'Site',
            apiSource,
            scannedFields: [],
            edits: { query: { label: 'Search term', lastEdit: null } },
        });
        expect(edited.apiSource?.definitionHash).toBe(
            plain.apiSource?.definitionHash,
        );
    });
});

describe('explore AI hints', () => {
    it.each([
        [
            {
                connector: ApiConnectorType.SEARCH_CONSOLE,
                siteUrl: 'https://example.com/',
            } as const,
            'https://searchconsole.googleapis.com',
            null,
            'Search Console site https://example.com/',
        ],
        [
            { connector: ApiConnectorType.GA4, propertyId: '123' } as const,
            'https://analyticsdata.googleapis.com',
            'Marketing site',
            'Google Analytics property "Marketing site" (ID 123)',
        ],
        [
            { connector: ApiConnectorType.GA4, propertyId: '123' } as const,
            'https://analyticsdata.googleapis.com',
            null,
            'Google Analytics property 123',
        ],
        [
            {
                connector: ApiConnectorType.POSTHOG,
                projectId: '303731',
            } as const,
            'https://eu.posthog.com',
            null,
            'PostHog project 303731, EU region',
        ],
        [
            {
                connector: ApiConnectorType.GOOGLE_ADS,
                customerId: '123',
                loginCustomerId: null,
            } as const,
            'https://googleads.googleapis.com',
            'Brand account',
            'Google Ads account "Brand account" (ID 123)',
        ],
        [
            {
                connector: ApiConnectorType.YOUTUBE_ANALYTICS,
                channelId: 'UC123',
            } as const,
            'https://youtubeanalytics.googleapis.com',
            null,
            'YouTube channel UC123',
        ],
        [
            {
                connector: ApiConnectorType.LINKEDIN_ADS,
                adAccountId: '456',
            } as const,
            'https://api.linkedin.com',
            null,
            'LinkedIn Ads account 456',
        ],
        [
            {
                connector: ApiConnectorType.META_ADS,
                adAccountId: '789',
            } as const,
            'https://graph.facebook.com',
            null,
            'Meta Ads account 789',
        ],
    ])('describes the target of %j', (apiSource, origin, label, expected) => {
        expect(describeLiveTarget(apiSource, origin, label)).toBe(expected);
    });

    it('stores the target first, then the admin text, and keeps the hash', () => {
        const apiSource = {
            connector: ApiConnectorType.SEARCH_CONSOLE,
            siteUrl: 'https://example.com/',
        } as const;
        const args = {
            connectionUuid: CONNECTION_UUID,
            sourceName: 'site',
            name: 'Site',
            apiSource,
            scannedFields: [],
            edits: {},
        };
        const [hinted] = buildLiveExplores({
            ...args,
            aiHint: ['Search Console site https://example.com/', 'EU store'],
        });
        const [plain] = buildLiveExplores(args);
        expect(hinted.aiHint).toEqual([
            'Search Console site https://example.com/',
            'EU store',
        ]);
        expect(hinted.apiSource?.definitionHash).toBe(
            plain.apiSource?.definitionHash,
        );
        // A source hint must not leak onto the fields
        Object.values(hinted.tables.site_performance.dimensions).forEach(
            (dimension) => expect(dimension.aiHint).toBeUndefined(),
        );
    });
});

describe('getLostLiveFieldIds', () => {
    const rebuilt = [
        {
            name: 'site_performance',
            apiSource: { fields: { site_performance_clicks: {} } },
        },
    ] as unknown as Explore[];

    it('reports a stored field the rebuild no longer has', () => {
        expect(
            getLostLiveFieldIds({
                storedFieldIds: [
                    'site_performance_clicks',
                    'site_performance_custom',
                ],
                rebuilt,
                edits: {},
                sourceName: 'site',
                firstModel: 'performance',
            }),
        ).toEqual(['site_performance_custom']);
    });

    it('allows dropping a field an admin took out of use', () => {
        expect(
            getLostLiveFieldIds({
                storedFieldIds: ['site_performance_custom'],
                rebuilt,
                edits: { custom: { inUse: false, lastEdit: null } },
                sourceName: 'site',
                firstModel: 'performance',
            }),
        ).toEqual([]);
    });

    it('allows dropping a field taken out of use on another scanned explore', () => {
        expect(
            getLostLiveFieldIds({
                storedFieldIds: ['site_contacts_email', 'site_contacts_phone'],
                rebuilt,
                edits: { 'contacts.email': { inUse: false, lastEdit: null } },
                sourceName: 'site',
                firstModel: 'performance',
            }),
        ).toEqual(['site_contacts_phone']);
    });

    it('allows dropping every field of a switched-off explore, the first one included', () => {
        expect(
            getLostLiveFieldIds({
                storedFieldIds: [
                    'site_performance_clicks',
                    'site_contacts_email',
                ],
                rebuilt: [],
                edits: {},
                exploreEdits: {
                    performance: { inUse: false },
                    contacts: { inUse: false },
                },
                sourceName: 'site',
                firstModel: 'performance',
            }),
        ).toEqual([]);
    });
});
