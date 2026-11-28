import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    getApiSourceQueryIssues,
    getFilterOperatorOptions,
    getFilterTypeFromItem,
    getItemLabelWithoutTableName,
    getItemMap,
    isFilterableItem,
    LIVE_INTEGRATION_CATALOG,
    MetricType,
    ParameterError,
    UnitOfTime,
    type ApiSourceQueryContext,
    type Explore,
    type FilterRule,
    type LiveSourceRefusalCode,
    type MetricQuery,
} from '@lightdash/common';
import { buildLiveExplores, getLiveBaseLayer } from './explores/build';
import { assertLiveQuery } from './explores/definition';
import { type LiveCapabilities } from './types';

const CONNECTION_UUID = '03386598-7a51-45b2-b1f9-5ef55bd09016';
// One entry per integration, with the declared fields every case uses, by
// semantic-layer name. Every case below reads what each integration declares.
const SOURCES = [
    {
        apiSource: { connector: ApiConnectorType.GA4, propertyId: '123' },
        fields: { dimension: 'country', other: 'city', metric: 'sessions' },
    },
    {
        apiSource: {
            connector: ApiConnectorType.SEARCH_CONSOLE,
            siteUrl: 'sc-domain:example.com',
        },
        fields: { dimension: 'country', other: 'device', metric: 'clicks' },
    },
    {
        apiSource: {
            connector: ApiConnectorType.YOUTUBE_ANALYTICS,
            channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
        },
        fields: {
            dimension: 'country',
            other: 'video_id',
            metric: 'views',
        },
    },
    {
        apiSource: {
            connector: ApiConnectorType.LINKEDIN_ADS,
            adAccountId: '507404993',
        },
        fields: {
            dimension: 'campaign_id',
            other: 'campaign_group_id',
            metric: 'impressions',
        },
    },
    {
        apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '42' },
        fields: {
            dimension: 'event',
            other: 'browser',
            metric: 'event_count',
        },
    },
    {
        apiSource: { connector: ApiConnectorType.META_ADS, adAccountId: '123' },
        fields: {
            dimension: 'campaign_name',
            other: 'adset_name',
            metric: 'spend',
        },
    },
    {
        apiSource: {
            connector: ApiConnectorType.GOOGLE_ADS,
            customerId: '1234567890',
            loginCustomerId: null,
        },
        fields: {
            dimension: 'account_name',
            other: 'account_currency',
            metric: 'clicks',
        },
    },
    {
        apiSource: {
            connector: ApiConnectorType.GITHUB,
            owner: 'lightdash',
            repo: 'lightdash',
        },
        fields: { dimension: 'author', other: 'assignee', metric: 'count' },
        // A search total can't be split by a dimension, so cases filter on
        // it instead of selecting it
        date: 'created_at',
        selectsDimension: false,
    },
    {
        apiSource: { connector: ApiConnectorType.PYLON },
        // Record lists have no metrics
        fields: { dimension: 'state', other: 'source' },
        date: 'created_at',
    },
    {
        apiSource: { connector: ApiConnectorType.ATTIO },
        // Declared fields only: attributes come from a scan. No metrics.
        fields: { dimension: 'record_id', other: 'record_id' },
        date: 'created_at',
    },
    {
        apiSource: { connector: ApiConnectorType.HUBSPOT, object: 'deals' },
        // Declared fields only: properties come from a scan. Count is the
        // search total, so cases filter on dimensions instead of selecting them
        fields: {
            dimension: 'record_id',
            other: 'updated_at',
            metric: 'count',
        },
        date: 'created_at',
        selectsDimension: false,
    },
    {
        apiSource: { connector: ApiConnectorType.SALESFORCE },
        // Declared fields only: the object's fields come from a scan
        fields: {
            dimension: 'record_id',
            other: 'created_at_day',
            metric: 'count',
        },
        date: 'created_at',
    },
] as const;

const CONNECTORS: ApiConnectorType[] = SOURCES.map(
    ({ apiSource }) => apiSource.connector,
);

const getSource = (connector: ApiConnectorType) => {
    const source = SOURCES.find(
        ({ apiSource }) => apiSource.connector === connector,
    );
    if (!source) throw new Error(`No source for ${connector}`);
    return source;
};

const build = (connector: ApiConnectorType): Explore => {
    const { apiSource } = getSource(connector);
    const [explore] = buildLiveExplores({
        connectionUuid: CONNECTION_UUID,
        sourceName: connector,
        name: 'Source',
        apiSource,
    });
    return explore;
};

/** The same explore as cached before connectors declared capabilities. */
const withoutCapabilities = (explore: Explore): Explore => {
    if (!explore.apiSource) throw new Error('Not a live explore');
    const { capabilities, ...apiSource } = explore.apiSource;
    return { ...explore, apiSource };
};

// Refusals name fields and operators as the UI does
const fieldLabel = (connector: ApiConnectorType, fieldId: string) =>
    getItemLabelWithoutTableName(getItemMap(build(connector))[fieldId]);
const operatorLabel = (
    connector: ApiConnectorType,
    fieldId: string,
    operator: FilterOperator,
) => {
    const item = getItemMap(build(connector))[fieldId];
    const label = isFilterableItem(item)
        ? getFilterOperatorOptions(getFilterTypeFromItem(item), item).find(
              ({ value }) => value === operator,
          )?.label
        : undefined;
    return `"${label ?? operator}"`;
};
const sourceLabel = (connector: ApiConnectorType) =>
    LIVE_INTEGRATION_CATALOG[connector].messageLabel;

const toFieldId = (connector: ApiConnectorType, name: string) =>
    `${connector}_${getLiveBaseLayer(connector).definitions[0].name}_${name}`;

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
    /** Where a connector refuses it under another code. */
    codes?: Partial<Record<ApiConnectorType, LiveSourceRefusalCode>>;
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

type Refusals = Partial<Record<ApiConnectorType, string[]>>;

const everywhere = (message: string): Refusals =>
    Object.fromEntries(CONNECTORS.map((connector) => [connector, [message]]));

/** Refused by the connectors whose declaration matches, in each one's words. */
const wherever = (
    matches: (
        capabilities: LiveCapabilities,
        connector: ApiConnectorType,
    ) => boolean,
    message: (
        connector: ApiConnectorType,
        capabilities: LiveCapabilities,
    ) => string,
): Refusals =>
    Object.fromEntries(
        CONNECTORS.flatMap((connector) => {
            const { capabilities } = getLiveBaseLayer(connector);
            return matches(capabilities, connector)
                ? [[connector, [message(connector, capabilities)]]]
                : [];
        }),
    );

const isFlatAnd = ({ filters }: LiveCapabilities) => !filters.or;
const needsDateRange = ({ dates }: LiveCapabilities) => dates.rangeRequired;

// Report APIs refuse what PostHog compiles into HogQL; PostHog explores
// cached before capabilities still refuse it until they are refreshed
const reportApisOnly = (message: string) => ({
    expected: Object.fromEntries(
        CONNECTORS.filter(
            (connector) => connector !== ApiConnectorType.POSTHOG,
        ).map((connector) => [connector, [message]]),
    ),
    stale: everywhere(message),
});

type FieldKey = 'dimension' | 'other' | 'metric';
const fieldName = (connector: ApiConnectorType, key: FieldKey) => {
    const { fields } = getSource(connector);
    return key in fields ? String(fields[key as keyof typeof fields]) : null;
};
const id = (connector: ApiConnectorType, key: FieldKey) => {
    const name = fieldName(connector, key);
    if (!name) throw new Error(`${connector} has no ${key} field`);
    return toFieldId(connector, name);
};
const hasMetric = (connector: ApiConnectorType) =>
    fieldName(connector, 'metric') !== null;
const date = (connector: ApiConnectorType) => {
    // A source names its date field when it isn't `date`
    const source = getSource(connector);
    return toFieldId(
        connector,
        'date' in source ? String(source.date) : 'date',
    );
};

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
        expected: wherever(
            isFlatAnd,
            () =>
                'This live data source only combines filters with AND. Replace the OR group with separate queries.',
        ),
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
        expected: wherever(
            ({ filters }) => !filters.nestedGroups,
            () =>
                "This live data source can't nest filter groups. Put every filter in one group.",
        ),
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
        expected: {
            [ApiConnectorType.GITHUB]: [
                `GitHub matches one value per filter; filter ${fieldLabel(ApiConnectorType.GITHUB, id(ApiConnectorType.GITHUB, 'dimension'))} by one value at a time.`,
            ],
        },
        stale: {
            // Never cached before capabilities, which allowed it
            [ApiConnectorType.GITHUB]: [],
            [ApiConnectorType.SEARCH_CONSOLE]: [
                `Search Console matches one value per filter; filter ${fieldLabel(ApiConnectorType.SEARCH_CONSOLE, id(ApiConnectorType.SEARCH_CONSOLE, 'dimension'))} by one value at a time.`,
            ],
        },
    },
    {
        name: 'a metric filter',
        code: 'live_source.refused.metric_filter',
        query: (connector) =>
            hasMetric(connector)
                ? {
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
                  }
                : {},
        expected: wherever(
            ({ metricFilters }, connector) =>
                !metricFilters && hasMetric(connector),
            (connector) =>
                `${fieldLabel(connector, id(connector, 'metric'))} can't be filtered on ${sourceLabel(connector)}.`,
        ),
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
            ...wherever(
                isFlatAnd,
                () =>
                    'This live data source only combines filters with AND. Replace the OR group with separate queries.',
            ),
            [ApiConnectorType.GA4]: [
                'Filter the date with one filter combined with the others by AND, not inside an OR group.',
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
        expected: wherever(
            needsDateRange,
            () =>
                'Filter the date once: combine the date filters into one range.',
        ),
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
        expected: wherever(
            needsDateRange,
            () =>
                'Live data sources report by day; filter in days or longer, not hours.',
        ),
    },
    {
        name: 'a date operator the API lacks',
        code: 'live_source.refused.date_operator',
        // GitHub, Attio, HubSpot and Salesforce have no date range, so their dates are ordinary filters
        codes: {
            [ApiConnectorType.GITHUB]: 'live_source.refused.filter_operator',
            [ApiConnectorType.ATTIO]: 'live_source.refused.filter_operator',
            [ApiConnectorType.HUBSPOT]: 'live_source.refused.filter_operator',
            [ApiConnectorType.SALESFORCE]:
                'live_source.refused.filter_operator',
        },
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
        expected: wherever(
            ({ dates }) =>
                !dates.operators.includes(FilterOperator.NOT_IN_THE_PAST),
            (connector, { dates }) =>
                `${fieldLabel(connector, date(connector))} can't use ${operatorLabel(connector, date(connector), FilterOperator.NOT_IN_THE_PAST)} on ${sourceLabel(connector)}. Use one of: ${dates.operators
                    .map((operator) =>
                        operatorLabel(connector, date(connector), operator),
                    )
                    .join(', ')}.`,
        ),
    },
];

const toQuery = (
    connector: ApiConnectorType,
    overrides: Partial<MetricQuery>,
): MetricQuery => ({
    exploreName: `${connector}_explore`,
    dimensions:
        'selectsDimension' in getSource(connector)
            ? []
            : [id(connector, 'dimension')],
    metrics: hasMetric(connector) ? [id(connector, 'metric')] : [],
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
    return getApiSourceQueryIssues(explore.apiSource, metricQuery, {
        itemsMap: getItemMap(explore),
        ...context,
    }).map(({ message }) => message);
};

describe('live data source capabilities keep their refusals', () => {
    describe.each(CONNECTORS)('%s', (connector) => {
        const explore = build(connector);

        test.each(CASES)(
            '$name',
            ({ query, context, expected, stale, code: caseCode, codes }) => {
                const code = codes?.[connector] ?? caseCode;
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
                        assertLiveQuery(explore, metricQuery, context),
                    ).toThrow(ParameterError);
                    expect(() =>
                        assertLiveQuery(explore, metricQuery, context),
                    ).toThrow(messages.join(' '));
                    // Every refusal carries its codes for the API response
                    try {
                        assertLiveQuery(explore, metricQuery, context);
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
            },
        );
    });
});

describe('connector capability declarations', () => {
    describe.each(CONNECTORS)('%s', (connector) => {
        const { capabilities, definitions } = getLiveBaseLayer(connector);

        test('every field filters with operators its type allows', () => {
            definitions.forEach((definition) => {
                // Grains of the date dimension are filtered through the date
                definition.dimensions
                    .filter(
                        ({ name, timeInterval }) =>
                            !timeInterval || timeInterval.base === name,
                    )
                    .forEach((dimension) => {
                        // A field can narrow its type, as when an API
                        // only compares ids as whole values
                        const allowed =
                            capabilities.filters.operators[dimension.type] ??
                            [];
                        expect([
                            dimension.name,
                            dimension.filterOperators.filter(
                                (operator) => !allowed.includes(operator),
                            ),
                        ]).toEqual([dimension.name, []]);
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
                if (!dateRange) {
                    return;
                }
                const field = dimensions.find(
                    ({ name }) => name === dateRange.dimension,
                );
                expect(field?.filterOperators).toEqual(
                    capabilities.dates.operators,
                );
            });
        });

        test('every declared metric has a reviewed additivity tag', () => {
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
                    [aggregation.numerator, aggregation.denominator].forEach(
                        (name) => {
                            expect([
                                name,
                                byName.get(name)?.aggregation?.aggregation,
                            ]).toEqual([name, 'additive']);
                        },
                    );
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
    });

    test('the summable tags', () => {
        expect(
            Object.fromEntries(
                CONNECTORS.map((connector) => [
                    connector,
                    build(connector).apiSource?.capabilities?.metrics,
                ]),
            ),
        ).toMatchSnapshot();
    });
});
