import {
    type ApiSourceCapabilities,
    type ApiSourceExplore,
} from '../types/apiSourceExplore';
import { MetricType } from '../types/field';
import { FilterOperator, type FilterGroup } from '../types/filter';
import { type MetricQuery } from '../types/metricQuery';
import { ApiConnectorType } from '../types/querySources';
import { TimeFrames } from '../types/timeFrames';
import {
    getApiSourceCapabilities,
    getApiSourceQueryIssues,
    type ApiSourceQueryContext,
} from './apiSourceQuery';

const apiSource: ApiSourceExplore = {
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.GA4,
    baseVersion: 1,
    filterGroups: { or: true, nested: true },
    maxDimensions: 2,
    maxMetrics: 2,
    dateRange: { fieldId: 'report_date', defaultDays: 28 },
    fields: {
        report_date: {
            apiName: 'date',
            filterOperators: [
                FilterOperator.IN_BETWEEN,
                FilterOperator.IN_THE_PAST,
            ],
        },
        report_channel: {
            apiName: 'sessionDefaultChannelGroup',
            filterOperators: [FilterOperator.EQUALS, FilterOperator.NOT_EQUALS],
        },
        report_item_name: {
            apiName: 'itemName',
            filterOperators: [FilterOperator.EQUALS],
        },
        report_sessions: {
            apiName: 'sessions',
            filterOperators: [FilterOperator.GREATER_THAN],
        },
        report_active_users: {
            apiName: 'activeUsers',
            filterOperators: [],
        },
    },
    incompatible: [
        {
            fields: ['report_item_name'],
            with: ['report_sessions'],
            reason: 'item-scoped dimensions only work with item-scoped metrics.',
        },
    ],
};

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: 'report',
    dimensions: ['report_channel'],
    metrics: ['report_sessions'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    ...overrides,
});

const rule = (
    fieldId: string,
    operator: FilterOperator,
    values: unknown[] = ['x'],
) => ({ id: `${fieldId}-${operator}`, target: { fieldId }, operator, values });

const messages = (metricQuery: MetricQuery) =>
    getApiSourceQueryIssues(apiSource, metricQuery).map(
        ({ message }) => message,
    );

describe('getApiSourceQueryIssues', () => {
    test('accepts a query the API can answer', () => {
        expect(
            messages(
                query({
                    filters: {
                        dimensions: {
                            id: 'dims',
                            and: [
                                rule(
                                    'report_date',
                                    FilterOperator.IN_THE_PAST,
                                    [28],
                                ),
                                rule('report_channel', FilterOperator.EQUALS),
                            ],
                        },
                        metrics: {
                            id: 'metrics',
                            and: [
                                rule(
                                    'report_sessions',
                                    FilterOperator.GREATER_THAN,
                                    [10],
                                ),
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'report_sessions', descending: true }],
                }),
            ),
        ).toEqual([]);
    });

    test('refuses features that need SQL', () => {
        expect(
            messages(
                query({
                    tableCalculations: [
                        { name: 'double', displayName: 'Double', sql: '1' },
                    ],
                    additionalMetrics: [
                        {
                            name: 'custom',
                            table: 'report',
                            type: MetricType.SUM,
                            sql: '1',
                        },
                    ],
                }),
            ),
        ).toEqual([
            "Table calculations can't run on live data sources yet. Remove them from the query.",
            "Custom metrics can't run on live data sources yet. Remove them from the query.",
        ]);
    });

    test('refuses fields the semantic layer has no rule for', () => {
        expect(
            getApiSourceQueryIssues(
                apiSource,
                query({ dimensions: ['report_city'] }),
            ),
        ).toEqual([
            {
                code: 'live_source.refused.unknown_field',
                fieldId: 'report_city',
                message:
                    '"report_city" isn\'t available from this live data source.',
            },
        ]);
    });

    test('treats object prototype keys as unknown fields', () => {
        expect(messages(query({ dimensions: ['constructor'] }))).toEqual([
            '"constructor" isn\'t available from this live data source.',
        ]);
    });

    test('names the operators a field supports when one is refused', () => {
        expect(
            messages(
                query({
                    filters: {
                        dimensions: {
                            id: 'dims',
                            and: [
                                rule('report_channel', FilterOperator.INCLUDE),
                            ],
                        },
                    },
                }),
            ),
        ).toEqual([
            '"report_channel" can\'t be filtered with "include". Use one of: equals, notEquals.',
        ]);
    });

    test('refuses filters on fields the API cannot filter', () => {
        expect(
            messages(
                query({
                    metrics: ['report_active_users'],
                    filters: {
                        metrics: {
                            id: 'metrics',
                            and: [
                                rule(
                                    'report_active_users',
                                    FilterOperator.GREATER_THAN,
                                    [5],
                                ),
                            ],
                        },
                    },
                }),
            ),
        ).toEqual([
            '"report_active_users" can\'t be filtered on this live data source.',
        ]);
    });

    test('ignores disabled filters', () => {
        expect(
            messages(
                query({
                    filters: {
                        dimensions: {
                            id: 'dims',
                            and: [
                                {
                                    ...rule(
                                        'report_channel',
                                        FilterOperator.INCLUDE,
                                    ),
                                    disabled: true,
                                },
                            ],
                        },
                    },
                }),
            ),
        ).toEqual([]);
    });

    describe('filter groups', () => {
        const orGroup: FilterGroup = {
            id: 'dims',
            or: [
                rule('report_channel', FilterOperator.EQUALS),
                {
                    id: 'nested',
                    and: [rule('report_channel', FilterOperator.NOT_EQUALS)],
                },
            ],
        };
        const andOnly: ApiSourceExplore = {
            ...apiSource,
            filterGroups: { or: false, nested: false },
        };

        test('accepts OR and nesting where the API supports them', () => {
            expect(
                messages(query({ filters: { dimensions: orGroup } })),
            ).toEqual([]);
        });

        test('refuses OR and nesting where the API is AND-only', () => {
            expect(
                getApiSourceQueryIssues(
                    andOnly,
                    query({ filters: { dimensions: orGroup } }),
                ).map(({ message }) => message),
            ).toEqual([
                'This live data source only combines filters with AND. Replace the OR group with separate queries.',
                "This live data source can't nest filter groups. Put every filter in one group.",
            ]);
        });

        test('treats a one-item OR group as AND', () => {
            expect(
                getApiSourceQueryIssues(
                    andOnly,
                    query({
                        filters: {
                            dimensions: {
                                id: 'dims',
                                or: [
                                    rule(
                                        'report_channel',
                                        FilterOperator.EQUALS,
                                    ),
                                ],
                            },
                        },
                    }),
                ),
            ).toEqual([]);
        });
    });

    test('refuses incompatible fields, including ones used only in filters', () => {
        expect(
            messages(
                query({
                    dimensions: [],
                    filters: {
                        dimensions: {
                            id: 'dims',
                            and: [
                                rule('report_item_name', FilterOperator.EQUALS),
                            ],
                        },
                    },
                }),
            ),
        ).toEqual([
            '"report_item_name" can\'t be combined with "report_sessions": item-scoped dimensions only work with item-scoped metrics.',
        ]);
    });

    test('refuses more dimensions or metrics than one call allows', () => {
        expect(
            messages(
                query({
                    dimensions: [
                        'report_channel',
                        'report_date',
                        'report_item_name',
                    ],
                    metrics: ['report_active_users'],
                }),
            ),
        ).toEqual([
            'This live data source allows at most 2 dimensions per query; this one has 3.',
        ]);
    });
});

describe('getApiSourceQueryIssues with declared capabilities', () => {
    const capabilities: ApiSourceCapabilities = {
        filters: {
            operators: {},
            multipleValues: false,
            or: true,
            nestedGroups: true,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: [FilterOperator.IN_BETWEEN, FilterOperator.IN_THE_PAST],
            grains: [TimeFrames.WEEK],
            timezone: 'fixed',
        },
        pushdown: {
            tableCalculations: 'native',
            customDimensions: 'refused',
            customMetrics: 'native',
            pivots: 'native',
            periodOverPeriod: 'refused',
            dateZoom: 'native',
        },
        metrics: {},
    };
    const declared = { ...apiSource, capabilities };
    const declaredMessages = (
        metricQuery: MetricQuery,
        context?: ApiSourceQueryContext,
    ) =>
        getApiSourceQueryIssues(declared, metricQuery, context).map(
            ({ message }) => message,
        );

    test('runs native features and refuses the rest', () => {
        expect(
            declaredMessages(
                query({
                    tableCalculations: [
                        { name: 'double', displayName: 'Double', sql: '1' },
                    ],
                    additionalMetrics: [
                        {
                            name: 'custom',
                            table: 'report',
                            type: MetricType.SUM,
                            sql: '1',
                        },
                        {
                            name: 'sessions_previous',
                            table: 'report',
                            type: MetricType.SUM,
                            sql: '1',
                            generationType: 'periodOverPeriod',
                            baseMetricId: 'report_sessions',
                            timeDimensionId: 'report_date',
                            granularity: TimeFrames.WEEK,
                            periodOffset: 1,
                        },
                    ],
                }),
                { isPivoted: true },
            ),
        ).toEqual([
            "Period-over-period comparisons can't run on live data sources yet. Remove them from the query.",
        ]);
    });

    test('allows date zoom only where the source runs it', () => {
        expect(
            declaredMessages(query(), { dateZoomGranularity: 'Week' }),
        ).toEqual([]);
        expect(
            messages(query()).length +
                getApiSourceQueryIssues(apiSource, query(), {
                    dateZoomGranularity: 'Week',
                }).length,
        ).toBe(1);
    });

    test('refuses metric filters when the source has none', () => {
        expect(
            declaredMessages(
                query({
                    filters: {
                        metrics: {
                            id: 'metrics',
                            and: [
                                rule(
                                    'report_sessions',
                                    FilterOperator.GREATER_THAN,
                                    [10],
                                ),
                            ],
                        },
                    },
                }),
            ),
        ).toEqual([
            '"report_sessions" can\'t be filtered on this live data source.',
        ]);
    });

    test('refuses several values in one match, but not on the date range', () => {
        expect(
            declaredMessages(
                query({
                    filters: {
                        dimensions: {
                            id: 'dims',
                            and: [
                                rule('report_channel', FilterOperator.EQUALS, [
                                    'a',
                                    'b',
                                ]),
                                rule('report_date', FilterOperator.IN_BETWEEN, [
                                    '2026-01-01',
                                    '2026-01-31',
                                ]),
                            ],
                        },
                    },
                }),
            ),
        ).toEqual([
            'Google Analytics matches one value per filter; filter "report_channel" by one value at a time.',
        ]);
    });

    test('reads explores cached before capabilities as refusing every feature', () => {
        expect(getApiSourceCapabilities(apiSource).pushdown).toEqual({
            tableCalculations: 'refused',
            customDimensions: 'refused',
            customMetrics: 'refused',
            pivots: 'refused',
            periodOverPeriod: 'refused',
            dateZoom: 'refused',
        });
        expect(getApiSourceCapabilities(declared)).toBe(capabilities);
    });
});
