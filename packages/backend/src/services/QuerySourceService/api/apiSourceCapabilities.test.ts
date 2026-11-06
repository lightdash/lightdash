import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    getApiSourceQueryIssues,
    MetricType,
    ParameterError,
    UnitOfTime,
    type ApiSourceQueryContext,
    type Explore,
    type FilterRule,
    type LiveSourceRefusalCode,
    type MetricQuery,
} from '@lightdash/common';
import { assertApiSourceQuery } from './apiSourceExplore';
import {
    buildApiSourceExplores,
    compileApiSourceMetricQuery,
    getApiSourceBaseLayer,
} from './apiSourceExplores';
import { getInitialLiveSourceFieldEdits } from './liveSourceFields';

const CONNECTION_UUID = '03386598-7a51-45b2-b1f9-5ef55bd09016';
const SOURCES = [
    { connector: ApiConnectorType.GA4, propertyId: '123' },
    {
        connector: ApiConnectorType.SEARCH_CONSOLE,
        siteUrl: 'sc-domain:example.com',
    },
    { connector: ApiConnectorType.POSTHOG, projectId: '42' },
] as const;

const build = (connector: ApiConnectorType): Explore => {
    const apiSource = SOURCES.find((source) => source.connector === connector);
    if (!apiSource) throw new Error(`No source for ${connector}`);
    const [explore] = buildApiSourceExplores({
        connectionUuid: CONNECTION_UUID,
        sourceName: connector,
        name: 'Source',
        apiSource,
        scannedFields: [],
        edits: getInitialLiveSourceFieldEdits({
            scannedFields: [],
            isExistingSource: true,
        }),
    });
    return explore;
};

/** The same explore as cached before connectors declared capabilities. */
const withoutCapabilities = (explore: Explore): Explore => {
    if (!explore.apiSource) throw new Error('Not a live explore');
    const { capabilities, ...apiSource } = explore.apiSource;
    return { ...explore, apiSource };
};

// Built-in fields every case uses, by semantic-layer name
const FIELDS = {
    [ApiConnectorType.GA4]: {
        dimension: 'country',
        other: 'city',
        metric: 'sessions',
    },
    [ApiConnectorType.SEARCH_CONSOLE]: {
        dimension: 'country',
        other: 'device',
        metric: 'clicks',
    },
    [ApiConnectorType.POSTHOG]: {
        dimension: 'event',
        other: 'browser',
        metric: 'event_count',
    },
};

const toFieldId = (connector: ApiConnectorType, name: string) =>
    `${connector}_${getApiSourceBaseLayer(connector).definitions[0].name}_${name}`;

const rule = (
    fieldId: string,
    operator: FilterOperator,
    values: unknown[],
    settings?: FilterRule['settings'],
): FilterRule => ({
    id: `${fieldId}-${operator}-${values.join(',')}`,
    target: { fieldId },
    operator,
    values,
    ...(settings ? { settings } : {}),
});

type Case = {
    name: string;
    /** The refusal's code wherever it is refused; per message when they differ. */
    code?: LiveSourceRefusalCode;
    query: (connector: ApiConnectorType) => Partial<MetricQuery>;
    context?: ApiSourceQueryContext;
    /** Today's refusal per connector; absent means the query runs. */
    expected: Partial<Record<ApiConnectorType, string[]>>;
    /**
     * Where an explore cached before capabilities still refuses what a
     * rebuilt one runs; it catches up on the next refresh.
     */
    stale?: Partial<Record<ApiConnectorType, string[]>>;
};

const everywhere = (message: string) => ({
    [ApiConnectorType.GA4]: [message],
    [ApiConnectorType.SEARCH_CONSOLE]: [message],
    [ApiConnectorType.POSTHOG]: [message],
});

// Report APIs refuse what PostHog compiles into HogQL; PostHog explores
// cached before capabilities still refuse it until they are refreshed
const reportApisOnly = (message: string) => ({
    expected: {
        [ApiConnectorType.GA4]: [message],
        [ApiConnectorType.SEARCH_CONSOLE]: [message],
    },
    stale: everywhere(message),
});

const id = (connector: ApiConnectorType, key: keyof typeof FIELDS.ga4) =>
    toFieldId(connector, FIELDS[connector][key]);
const date = (connector: ApiConnectorType) => toFieldId(connector, 'date');

// Every refusal the shared check replaced, with the message users saw
// before connectors declared capabilities.
const CASES: Case[] = [
    { name: 'a plain query', query: () => ({}), expected: {} },
    {
        name: 'a table calculation',
        code: 'live_source.refused.table_calculation',
        query: () => ({
            tableCalculations: [{ name: 'tc', displayName: 'TC', sql: '1' }],
        }),
        ...reportApisOnly(
            "Table calculations can't run on live data sources yet. Remove them from the query.",
        ),
    },
    {
        name: 'a custom metric',
        code: 'live_source.refused.custom_metric',
        query: (connector) => ({
            additionalMetrics: [
                {
                    name: 'custom',
                    table: connector,
                    type: MetricType.SUM,
                    sql: '1',
                },
            ],
        }),
        ...reportApisOnly(
            "Custom metrics can't run on live data sources yet. Remove them from the query.",
        ),
    },
    {
        name: 'a custom dimension',
        code: 'live_source.refused.custom_dimension',
        query: (connector) => ({
            customDimensions: [
                {
                    id: 'custom',
                    name: 'custom',
                    table: connector,
                    type: 'sql' as never,
                    sql: '1',
                    dimensionType: DimensionType.STRING,
                },
            ],
        }),
        ...reportApisOnly(
            "Custom dimensions can't run on live data sources yet. Remove them from the query.",
        ),
    },
    {
        name: 'a pivot',
        code: 'live_source.refused.pivot',
        query: () => ({}),
        context: { isPivoted: true },
        expected: everywhere(
            "Pivoted results aren't available from live data sources yet. Remove the pivot to run this query.",
        ),
    },
    {
        name: 'date zoom',
        code: 'live_source.refused.date_zoom',
        query: () => ({}),
        context: { dateZoomGranularity: 'Week' },
        expected: everywhere(
            "Date zoom isn't available on live data sources yet.",
        ),
    },
    {
        name: 'an OR group',
        code: 'live_source.refused.or_group',
        query: (connector) => ({
            filters: {
                dimensions: {
                    id: 'root',
                    or: [
                        rule(
                            id(connector, 'dimension'),
                            FilterOperator.EQUALS,
                            ['a'],
                        ),
                        rule(id(connector, 'other'), FilterOperator.EQUALS, [
                            'b',
                        ]),
                    ],
                },
            },
        }),
        expected: {
            [ApiConnectorType.SEARCH_CONSOLE]: [
                'This live data source only combines filters with AND. Replace the OR group with separate queries.',
            ],
        },
    },
    {
        name: 'a nested group',
        code: 'live_source.refused.nested_group',
        query: (connector) => ({
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        {
                            id: 'nested',
                            and: [
                                rule(
                                    id(connector, 'dimension'),
                                    FilterOperator.EQUALS,
                                    ['a'],
                                ),
                            ],
                        },
                    ],
                },
            },
        }),
        expected: {
            [ApiConnectorType.SEARCH_CONSOLE]: [
                "This live data source can't nest filter groups. Put every filter in one group.",
            ],
        },
    },
    {
        name: 'several values in one filter',
        code: 'live_source.refused.multiple_values',
        query: (connector) => ({
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        rule(
                            id(connector, 'dimension'),
                            FilterOperator.EQUALS,
                            ['a', 'b'],
                        ),
                    ],
                },
            },
        }),
        // Search Console ORs the values in one regex filter
        expected: {},
        stale: {
            [ApiConnectorType.SEARCH_CONSOLE]: [
                `Search Console matches one value per filter; filter "${id(ApiConnectorType.SEARCH_CONSOLE, 'dimension')}" by one value at a time.`,
            ],
        },
    },
    {
        name: 'a metric filter',
        code: 'live_source.refused.metric_filter',
        query: (connector) => ({
            filters: {
                metrics: {
                    id: 'metrics',
                    and: [
                        rule(
                            id(connector, 'metric'),
                            FilterOperator.GREATER_THAN,
                            [1],
                        ),
                    ],
                },
            },
        }),
        expected: {
            [ApiConnectorType.SEARCH_CONSOLE]: [
                `"${id(ApiConnectorType.SEARCH_CONSOLE, 'metric')}" can't be filtered on this live data source.`,
            ],
        },
    },
    {
        name: 'a date inside an OR group',
        query: (connector) => ({
            filters: {
                dimensions: {
                    id: 'root',
                    or: [
                        rule(date(connector), FilterOperator.IN_THE_PAST, [7]),
                        rule(
                            id(connector, 'dimension'),
                            FilterOperator.EQUALS,
                            ['a'],
                        ),
                    ],
                },
            },
        }),
        expected: {
            [ApiConnectorType.GA4]: [
                'Filter the date with one filter combined with the others by AND, not inside an OR group.',
            ],
            [ApiConnectorType.SEARCH_CONSOLE]: [
                'This live data source only combines filters with AND. Replace the OR group with separate queries.',
            ],
        },
    },
    {
        name: 'two date filters',
        code: 'live_source.refused.date_range',
        query: (connector) => ({
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        rule(date(connector), FilterOperator.IN_THE_PAST, [7]),
                        rule(date(connector), FilterOperator.EQUALS, [
                            '2026-11-01',
                        ]),
                    ],
                },
            },
        }),
        expected: {
            [ApiConnectorType.GA4]: [
                'Filter the date once: combine the date filters into one range.',
            ],
            [ApiConnectorType.SEARCH_CONSOLE]: [
                'Filter the date once: combine the date filters into one range.',
            ],
        },
    },
    {
        name: 'a date in the past hours',
        code: 'live_source.refused.date_operator',
        query: (connector) => ({
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        rule(date(connector), FilterOperator.IN_THE_PAST, [6], {
                            unitOfTime: UnitOfTime.hours,
                        }),
                    ],
                },
            },
        }),
        expected: {
            [ApiConnectorType.GA4]: [
                'Live data sources report by day; filter in days or longer, not hours.',
            ],
            [ApiConnectorType.SEARCH_CONSOLE]: [
                'Live data sources report by day; filter in days or longer, not hours.',
            ],
        },
    },
    {
        name: 'a date operator the API lacks',
        code: 'live_source.refused.date_operator',
        query: (connector) => ({
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        rule(
                            date(connector),
                            FilterOperator.NOT_IN_THE_PAST,
                            [7],
                        ),
                    ],
                },
            },
        }),
        // GA4 reads it as everything before that range
        expected: {
            [ApiConnectorType.SEARCH_CONSOLE]: [
                `"${date(ApiConnectorType.SEARCH_CONSOLE)}" can't be filtered with "notInThePast". Use one of: inThePast, inBetween, equals.`,
            ],
        },
    },
];

const toQuery = (
    connector: ApiConnectorType,
    overrides: Partial<MetricQuery>,
): MetricQuery => ({
    exploreName: `${connector}_explore`,
    dimensions: [id(connector, 'dimension')],
    metrics: [id(connector, 'metric')],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    ...overrides,
});

const getMessages = (
    explore: Explore,
    metricQuery: MetricQuery,
    context?: ApiSourceQueryContext,
) => {
    if (!explore.apiSource) throw new Error('Not a live explore');
    return getApiSourceQueryIssues(explore.apiSource, metricQuery, context).map(
        ({ message }) => message,
    );
};

describe('live data source capabilities keep their refusals', () => {
    describe.each(SOURCES.map(({ connector }) => connector))(
        '%s',
        (connector) => {
            const explore = build(connector);

            test.each(CASES)(
                '$name',
                ({ query, context, expected, stale, code }) => {
                    const metricQuery = toQuery(connector, query(connector));
                    const messages = getMessages(explore, metricQuery, context);
                    expect(messages).toEqual(expected[connector] ?? []);
                    if (code && explore.apiSource) {
                        expect(
                            getApiSourceQueryIssues(
                                explore.apiSource,
                                metricQuery,
                                context,
                            ).map((issue) => issue.code),
                        ).toEqual(messages.map(() => code));
                    }
                    // Explores cached before capabilities refuse the same, or
                    // more where a connector learned something since
                    expect(
                        getMessages(
                            withoutCapabilities(explore),
                            metricQuery,
                            context,
                        ),
                    ).toEqual(stale?.[connector] ?? messages);
                    // Every entry point throws the same joined message
                    if (messages.length > 0) {
                        expect(() =>
                            assertApiSourceQuery(explore, metricQuery, context),
                        ).toThrow(ParameterError);
                        expect(() =>
                            assertApiSourceQuery(explore, metricQuery, context),
                        ).toThrow(messages.join(' '));
                        // Every refusal carries its codes for the API response
                        try {
                            assertApiSourceQuery(explore, metricQuery, context);
                        } catch (error) {
                            expect(error).toMatchObject({
                                data: {
                                    liveSourceErrorCode: expect.stringMatching(
                                        /^live_source\.refused\./,
                                    ),
                                },
                            });
                        }
                    }
                    if (messages.length > 0 && !context) {
                        expect(() =>
                            compileApiSourceMetricQuery({
                                explore,
                                metricQuery,
                                timezone: 'UTC',
                                now: new Date('2026-11-06T12:00:00Z'),
                            }),
                        ).toThrow(messages.join(' '));
                    }
                },
            );
        },
    );
});

describe('connector capability declarations', () => {
    describe.each(SOURCES.map(({ connector }) => connector))(
        '%s',
        (connector) => {
            const { capabilities, definitions } =
                getApiSourceBaseLayer(connector);

            test('every field filters with its type operators', () => {
                definitions.forEach((definition) => {
                    // Grains of the date dimension are filtered through the date
                    definition.dimensions
                        .filter(
                            ({ name, timeInterval }) =>
                                !timeInterval || timeInterval.base === name,
                        )
                        .forEach((dimension) => {
                            expect([
                                dimension.name,
                                dimension.filterOperators,
                            ]).toEqual([
                                dimension.name,
                                capabilities.filters.operators[
                                    dimension.type
                                ] ?? [],
                            ]);
                        });
                    definition.metrics.forEach((metric) => {
                        expect([metric.name, metric.filterOperators]).toEqual([
                            metric.name,
                            capabilities.metricFilters
                                ? (capabilities.filters.operators.metric ?? [])
                                : [],
                        ]);
                    });
                });
            });

            test('the date range field uses the date operators', () => {
                definitions.forEach(({ dateRange, dimensions }) => {
                    const field = dimensions.find(
                        ({ name }) => name === dateRange?.dimension,
                    );
                    expect(field?.filterOperators).toEqual(
                        capabilities.dates.operators,
                    );
                });
            });

            test('every built-in metric has a reviewed additivity tag', () => {
                definitions.forEach(({ metrics }) => {
                    metrics.forEach((metric) => {
                        expect([metric.name, metric.aggregation]).toEqual([
                            metric.name,
                            expect.objectContaining({
                                aggregation: expect.any(String),
                            }),
                        ]);
                    });
                });
            });

            test('ratios are built from additive metrics of the same model', () => {
                definitions.forEach(({ metrics }) => {
                    const byName = new Map(
                        metrics.map((metric) => [metric.name, metric]),
                    );
                    metrics.forEach(({ aggregation }) => {
                        if (aggregation?.aggregation !== 'ratio') return;
                        [
                            aggregation.numerator,
                            aggregation.denominator,
                        ].forEach((name) => {
                            expect([
                                name,
                                byName.get(name)?.aggregation?.aggregation,
                            ]).toEqual([name, 'additive']);
                        });
                    });
                });
            });

            test('built explores carry the capabilities and metric tags', () => {
                const { apiSource } = build(connector);
                expect(apiSource?.capabilities).toEqual({
                    ...capabilities,
                    metrics: Object.fromEntries(
                        definitions[0].metrics.map(({ name, aggregation }) => [
                            name,
                            aggregation,
                        ]),
                    ),
                });
            });
        },
    );

    test('the summable tags', () => {
        expect(
            Object.fromEntries(
                SOURCES.map(({ connector }) => [
                    connector,
                    build(connector).apiSource?.capabilities?.metrics,
                ]),
            ),
        ).toMatchSnapshot();
    });
});
