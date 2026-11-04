import {
    ApiConnectorType,
    FilterOperator,
    ParameterError,
    SupportedDbtAdapter,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { buildApiSourceExplore } from '../apiSourceExplore';
import { compileGa4Query } from './ga4Compiler';
import {
    GA4_REPORT_EXPLORE,
    GA4_SEMANTIC_LAYER_VERSION,
    withGa4MetadataFields,
} from './ga4SemanticLayer';

const EXPLORE = 'ga4_report';

const buildExplore = (definition = GA4_REPORT_EXPLORE) =>
    buildApiSourceExplore({
        definition,
        exploreName: EXPLORE,
        label: 'Marketing site',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.GA4,
        baseVersion: GA4_SEMANTIC_LAYER_VERSION,
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
        ),
    });

const field = (name: string) => `${EXPLORE}_${name}`;

const rule = (
    name: string,
    operator: FilterOperator,
    values: unknown[] = [],
): FilterRule => ({
    id: `${name}-${operator}`,
    target: { fieldId: field(name) },
    operator,
    values,
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: EXPLORE,
    dimensions: [field('session_default_channel_group')],
    metrics: [field('sessions')],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    ...overrides,
});

const compile = (metricQuery: MetricQuery, explore = buildExplore()) => {
    const compiled = compileGa4Query({
        explore,
        metricQuery,
        today: '2026-11-04',
    });
    return { ...compiled, request: JSON.parse(compiled.query) };
};

describe('GA4 semantic layer', () => {
    test('keeps its field ids stable', () => {
        expect(
            Object.keys(buildExplore().apiSource?.fields ?? {}),
        ).toMatchSnapshot();
    });
});

describe('compileGa4Query', () => {
    test('compiles a query into one runReport body', () => {
        const { request, fieldIdsByColumn, localSorts, requestLimit } = compile(
            query({
                sorts: [{ fieldId: field('sessions'), descending: true }],
            }),
        );
        expect(request).toEqual({
            dateRanges: [{ startDate: '28daysAgo', endDate: '1daysAgo' }],
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        });
        expect(fieldIdsByColumn).toEqual({
            sessionDefaultChannelGroup: field('session_default_channel_group'),
            sessions: field('sessions'),
        });
        expect(localSorts).toEqual([]);
        expect(requestLimit).toBe(100);
    });

    test('sends the date filter as the date range', () => {
        const { request } = compile(
            query({
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            rule('date', FilterOperator.IN_BETWEEN, [
                                '2026-10-01',
                                '2026-10-31',
                            ]),
                        ],
                    },
                },
            }),
        );
        expect(request.dateRanges).toEqual([
            { startDate: '2026-10-01', endDate: '2026-10-31' },
        ]);
        expect(request.dimensionFilter).toBeUndefined();
    });

    test('compiles AND, OR and negated dimension filters', () => {
        const { request } = compile(
            query({
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            rule('country', FilterOperator.EQUALS, [
                                'GB',
                                'US',
                            ]),
                            {
                                id: 'either',
                                or: [
                                    rule(
                                        'page_path',
                                        FilterOperator.STARTS_WITH,
                                        ['/docs'],
                                    ),
                                    rule(
                                        'session_source',
                                        FilterOperator.NOT_EQUALS,
                                        ['google'],
                                    ),
                                ],
                            },
                            rule('session_medium', FilterOperator.NOT_NULL),
                        ],
                    },
                },
            }),
        );
        expect(request.dimensionFilter).toEqual({
            andGroup: {
                expressions: [
                    {
                        filter: {
                            fieldName: 'country',
                            inListFilter: {
                                values: ['GB', 'US'],
                                caseSensitive: true,
                            },
                        },
                    },
                    {
                        orGroup: {
                            expressions: [
                                {
                                    filter: {
                                        fieldName: 'pagePath',
                                        stringFilter: {
                                            matchType: 'BEGINS_WITH',
                                            value: '/docs',
                                            caseSensitive: true,
                                        },
                                    },
                                },
                                {
                                    notExpression: {
                                        filter: {
                                            fieldName: 'sessionSource',
                                            stringFilter: {
                                                matchType: 'EXACT',
                                                value: 'google',
                                                caseSensitive: true,
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                    {
                        notExpression: {
                            filter: {
                                fieldName: 'sessionMedium',
                                emptyFilter: {},
                            },
                        },
                    },
                ],
            },
        });
    });

    test('skips filters without values, as warehouse queries do', () => {
        const { request } = compile(
            query({
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [rule('country', FilterOperator.EQUALS, [])],
                    },
                },
            }),
        );
        expect(request.dimensionFilter).toBeUndefined();
    });

    test('compiles metric filters as a metricFilter', () => {
        const { request } = compile(
            query({
                filters: {
                    metrics: {
                        id: 'metrics',
                        and: [
                            rule(
                                'sessions',
                                FilterOperator.GREATER_THAN,
                                [100],
                            ),
                            rule('sessions', FilterOperator.IN_BETWEEN, [1, 5]),
                        ],
                    },
                },
            }),
        );
        expect(request.metricFilter).toEqual({
            andGroup: {
                expressions: [
                    {
                        filter: {
                            fieldName: 'sessions',
                            numericFilter: {
                                operation: 'GREATER_THAN',
                                value: { doubleValue: 100 },
                            },
                        },
                    },
                    {
                        filter: {
                            fieldName: 'sessions',
                            betweenFilter: {
                                fromValue: { doubleValue: 1 },
                                toValue: { doubleValue: 5 },
                            },
                        },
                    },
                ],
            },
        });
    });

    test('asks for a metric it drops when the query has none', () => {
        const { request, fieldIdsByColumn } = compile(
            query({ metrics: [], sorts: [] }),
        );
        expect(request.metrics).toEqual([{ name: 'eventCount' }]);
        expect(fieldIdsByColumn).toEqual({
            sessionDefaultChannelGroup: field('session_default_channel_group'),
        });
    });

    test('refuses incompatible fields before calling the API', () => {
        expect(() =>
            compile(query({ dimensions: [field('item_name')] })),
        ).toThrow(ParameterError);
        expect(() =>
            compile(query({ dimensions: [field('item_name')] })),
        ).toThrow('item dimensions with item metrics');
    });

    test('maps custom fields to the column names the connector returns', () => {
        const explore = buildExplore(
            withGa4MetadataFields(GA4_REPORT_EXPLORE, {
                dimensions: [
                    {
                        apiName: 'customEvent:plan_type',
                        uiName: 'Plan type',
                        customDefinition: true,
                    },
                ],
            }),
        );
        const { request, fieldIdsByColumn } = compile(
            query({ dimensions: [field('custom_event_plan_type')] }),
            explore,
        );
        expect(request.dimensions).toEqual([{ name: 'customEvent:plan_type' }]);
        expect(fieldIdsByColumn.customEvent_plan_type).toBe(
            field('custom_event_plan_type'),
        );
    });
});

describe('withGa4MetadataFields', () => {
    test('adds custom fields and key events, but not standard fields', () => {
        const definition = withGa4MetadataFields(GA4_REPORT_EXPLORE, {
            dimensions: [
                { apiName: 'country', uiName: 'Country' },
                {
                    apiName: 'customUser:tier',
                    uiName: 'Tier',
                    customDefinition: true,
                },
            ],
            metrics: [
                {
                    apiName: 'keyEvents:purchase',
                    uiName: 'Key events (purchase)',
                },
                {
                    apiName: 'customEvent:value',
                    uiName: 'Value',
                    customDefinition: true,
                },
                { apiName: 'sessions', uiName: 'Sessions' },
            ],
        });
        expect(
            definition.dimensions.slice(GA4_REPORT_EXPLORE.dimensions.length),
        ).toEqual([
            expect.objectContaining({
                name: 'custom_user_tier',
                apiName: 'customUser:tier',
                label: 'Tier',
            }),
        ]);
        expect(
            definition.metrics
                .slice(GA4_REPORT_EXPLORE.metrics.length)
                .map(({ name, type }) => ({ name, type })),
        ).toEqual([
            { name: 'key_events_purchase', type: 'number' },
            { name: 'custom_event_value', type: 'number' },
        ]);
    });

    test('keeps the hand-written fields when metadata is unreadable', () => {
        expect(withGa4MetadataFields(GA4_REPORT_EXPLORE, 'nope')).toBe(
            GA4_REPORT_EXPLORE,
        );
    });
});
