import {
    ApiConnectorType,
    FilterOperator,
    SupportedDbtAdapter,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { buildApiSourceExplore } from '../apiSourceExplore';
import { compileSearchConsoleQuery } from './searchConsoleCompiler';
import { SEARCH_CONSOLE_CAPABILITIES } from './SearchConsoleConnector';
import {
    SEARCH_CONSOLE_PERFORMANCE_EXPLORE,
    SEARCH_CONSOLE_SEMANTIC_LAYER_VERSION,
} from './searchConsoleSemanticLayer';

const EXPLORE = 'search_console_performance';
const MAX_ROWS = 24_999;

const explore = buildApiSourceExplore({
    definition: SEARCH_CONSOLE_PERFORMANCE_EXPLORE,
    exploreName: EXPLORE,
    label: 'lightdash.com',
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.SEARCH_CONSOLE,
    baseVersion: SEARCH_CONSOLE_SEMANTIC_LAYER_VERSION,
    capabilities: SEARCH_CONSOLE_CAPABILITIES,
    warehouseSqlBuilder: warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    ),
});

const field = (name: string) => `${EXPLORE}_${name}`;

const rule = (
    name: string,
    operator: FilterOperator,
    values: unknown[],
): FilterRule => ({
    id: `${name}-${operator}`,
    target: { fieldId: field(name) },
    operator,
    values,
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: EXPLORE,
    dimensions: [field('query')],
    metrics: [field('clicks'), field('ctr')],
    filters: {},
    sorts: [{ fieldId: field('clicks'), descending: true }],
    limit: 10,
    tableCalculations: [],
    ...overrides,
});

const compile = (metricQuery: MetricQuery) => {
    const compiled = compileSearchConsoleQuery({
        explore,
        metricQuery,
        today: '2026-11-04',
        maxRows: MAX_ROWS,
    });
    return { ...compiled, request: JSON.parse(compiled.query) };
};

describe('Search Console semantic layer', () => {
    test('keeps its field ids stable', () => {
        expect(Object.keys(explore.apiSource?.fields ?? {})).toMatchSnapshot();
    });
});

describe('compileSearchConsoleQuery', () => {
    test('compiles a top-queries question into one request in API order', () => {
        const { request, fieldIdsByColumn, localSorts, requestLimit, limit } =
            compile(query());
        expect(request).toEqual({
            startDate: '2026-10-07',
            endDate: '2026-11-03',
            dimensions: ['query'],
            rowLimit: 10,
        });
        expect(fieldIdsByColumn).toEqual({
            query: field('query'),
            clicks: field('clicks'),
            ctr: field('ctr'),
        });
        expect(localSorts).toEqual([]);
        expect([requestLimit, limit]).toEqual([10, 10]);
    });

    test('fetches every row and sorts locally when ordered by anything but clicks', () => {
        const sorts = [{ fieldId: field('ctr'), descending: true }];
        const { request, localSorts, requestLimit, limit } = compile(
            query({ sorts }),
        );
        expect(request.rowLimit).toBe(MAX_ROWS);
        expect(localSorts).toEqual(sorts);
        expect([requestLimit, limit]).toEqual([MAX_ROWS, 10]);
    });

    test('sorts locally by clicks when grouping by date, which the API returns by date', () => {
        const sorts = [{ fieldId: field('clicks'), descending: true }];
        const { request, localSorts, requestLimit, limit } = compile(
            query({ dimensions: [field('date')], sorts }),
        );
        expect(request.rowLimit).toBe(MAX_ROWS);
        expect(localSorts).toEqual(sorts);
        expect([requestLimit, limit]).toEqual([MAX_ROWS, 10]);
    });

    test('sends the date filter as dates and the rest as one AND group', () => {
        const { request } = compile(
            query({
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            rule('date', FilterOperator.IN_THE_PAST, [7]),
                            rule('page', FilterOperator.INCLUDE, ['/docs']),
                            rule('country', FilterOperator.NOT_EQUALS, [
                                'usa',
                                'gbr',
                            ]),
                        ],
                    },
                },
            }),
        );
        expect(request.startDate).toBe('2026-10-28');
        expect(request.endDate).toBe('2026-11-04');
        expect(request.dimensionFilterGroups).toEqual([
            {
                groupType: 'and',
                filters: [
                    {
                        dimension: 'page',
                        operator: 'contains',
                        expression: '/docs',
                    },
                    {
                        dimension: 'country',
                        operator: 'notEquals',
                        expression: 'usa',
                    },
                    {
                        dimension: 'country',
                        operator: 'notEquals',
                        expression: 'gbr',
                    },
                ],
            },
        ]);
    });

    test('drops "is not null", which every Search Console value meets', () => {
        const { request } = compile(
            query({
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [rule('device', FilterOperator.NOT_NULL, [])],
                    },
                },
            }),
        );
        expect(request.dimensionFilterGroups).toBeUndefined();
    });
});
