import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    QueryHistoryStatus,
    type ApiExploreResults,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import { AUTO_FETCH_ENABLED_KEY } from '../components/RunQuerySettings/defaults';
import {
    createExplorerStore,
    explorerActions,
    type ExplorerRootState,
} from '../features/explorer/store';
import { defaultState } from '../providers/Explorer/defaultState';
import { useExplorerQueryEffects } from './useExplorerQueryEffects';
import { useExplorerQueryManager } from './useExplorerQueryManager';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));

const mockApi = vi.mocked(lightdashApi);

const projectUuid = 'project-uuid';
const tableName = 'orders';

const fields = {
    orders_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        table: tableName,
        name: 'status',
        label: 'Status',
        sql: '${TABLE}.status',
        compiledSql: 'orders.status',
    },
    payments_payment_method: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        table: 'payments',
        name: 'payment_method',
        label: 'Payment method',
        sql: '${TABLE}.payment_method',
        compiledSql: 'payments.payment_method',
    },
    payments_total_revenue: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        table: 'payments',
        name: 'total_revenue',
        label: 'Total revenue',
        sql: '${TABLE}.revenue',
        compiledSql: 'sum(orders.revenue)',
    },
    payments_total_cost: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        table: 'payments',
        name: 'total_cost',
        label: 'Total cost',
        sql: '${TABLE}.cost',
        compiledSql: 'sum(payments.cost)',
    },
};

const explore = {
    name: tableName,
    label: 'Orders',
    tags: [],
    baseTable: tableName,
    joinedTables: [],
    targetDatabase: 'postgres',
    tables: {
        [tableName]: {
            name: tableName,
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            dimensions: { orders_status: fields.orders_status },
            metrics: {},
            lineageGraph: {},
        },
        payments: {
            name: 'payments',
            label: 'Payments',
            database: 'db',
            schema: 'public',
            sqlTable: 'payments',
            dimensions: {
                payments_payment_method: fields.payments_payment_method,
            },
            metrics: {
                payments_total_revenue: fields.payments_total_revenue,
                payments_total_cost: fields.payments_total_cost,
            },
            lineageGraph: {},
        },
    },
} as unknown as ApiExploreResults;

const page = (queryUuid: string, columnId: string): ReadyQueryResultsPage =>
    ({
        queryUuid,
        status: QueryHistoryStatus.READY,
        page: 1,
        pageSize: 500,
        totalPageCount: 1,
        columns: { [columnId]: fields.payments_total_revenue },
        rows: [{ [columnId]: { value: { raw: 1, formatted: '1' } } }],
        metadata: {
            performance: {
                initialQueryExecutionMs: 0,
                resultsPageExecutionMs: 0,
                queueTimeMs: null,
            },
            preAggregate: null,
        },
        pivotDetails: null,
        totalResults: 1,
    }) as unknown as ReadyQueryResultsPage;

const initialState: ExplorerRootState = {
    explorer: {
        ...defaultState,
        parameterReferences: [],
        unsavedChartVersion: {
            ...defaultState.unsavedChartVersion,
            tableName,
            metricQuery: {
                ...defaultState.unsavedChartVersion.metricQuery,
                exploreName: tableName,
                dimensions: ['payments_payment_method', 'orders_status'],
                metrics: ['payments_total_revenue', 'payments_total_cost'],
            },
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'stream-graph',
                    fieldMapping: {
                        series: 'orders_status',
                        category: 'payments_payment_method',
                        value: 'payments_total_revenue',
                    },
                    optionValues: {},
                },
            },
            pivotConfig: { columns: ['orders_status'] },
        },
    },
};

describe('useExplorerQueryEffects', () => {
    afterEach(() => window.localStorage.removeItem(AUTO_FETCH_ENABLED_KEY));
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.setItem(AUTO_FETCH_ENABLED_KEY, 'false');

        let rawQueryCount = 0;
        mockApi.mockImplementation(async ({ url, body }) => {
            if (url === '/health?skipMigrationCheck=true') {
                return { preAggregates: { enabled: false } } as never;
            }
            if (url === `/projects/${projectUuid}/explores/${tableName}`) {
                return explore as never;
            }
            if (url === `/projects/${projectUuid}/query/metric-query`) {
                const request = JSON.parse(body as string);
                const queryUuid = request.pivotConfiguration
                    ? `pivoted-${request.pivotConfiguration.valuesColumns[0].reference}`
                    : `raw-query-${++rawQueryCount}`;
                return {
                    queryUuid,
                    metricQuery:
                        initialState.explorer.unsavedChartVersion.metricQuery,
                    fields,
                    warnings: [],
                    cacheMetadata: {},
                    parameterReferences: [],
                    usedParametersValues: {},
                    resolvedTimezone: null,
                } as never;
            }
            if (url.includes('/query/pivoted-')) {
                const queryUuid = url.split('/query/')[1].split('?')[0];
                const metricId = queryUuid.replace('pivoted-', '');
                return page(queryUuid, `${metricId}_any_completed`) as never;
            }
            if (url.includes('/query/raw-query-')) {
                return page(
                    url.split('/query/')[1].split('?')[0],
                    'payments_total_revenue',
                ) as never;
            }
            throw new Error(`Unhandled API request: ${url}`);
        });
    });

    it('reruns query-shape changes while auto-fetch is off', async () => {
        const store = createExplorerStore(initialState);
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <Provider store={store}>
                    <MemoryRouter>{children}</MemoryRouter>
                </Provider>
            </QueryClientProvider>
        );

        const { result } = renderHook(
            () => {
                useExplorerQueryEffects({ projectUuid });
                return useExplorerQueryManager({ projectUuid });
            },
            { wrapper },
        );

        await act(() =>
            store.dispatch(explorerActions.requestQueryExecution()),
        );
        await waitFor(() => {
            expect(result.current.queryResults.columns).toHaveProperty(
                'payments_total_revenue_any_completed',
            );
        });

        await act(() =>
            store.dispatch(
                explorerActions.setChartConfig({
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: {
                            dataAppVizUuid: 'stream-graph',
                            fieldMapping: {
                                category: 'payments_payment_method',
                                series: 'orders_status',
                                value: 'payments_total_cost',
                            },
                            optionValues: {},
                        },
                    },
                }),
            ),
        );

        await waitFor(() => {
            const requests = mockApi.mock.calls.filter(
                ([request]) =>
                    request.url ===
                    `/projects/${projectUuid}/query/metric-query`,
            );
            expect(requests).toHaveLength(3);
            expect(result.current.queryResults.columns).toHaveProperty(
                'payments_total_cost_any_completed',
            );
        });

        await act(() =>
            store.dispatch(
                explorerActions.setChartType({
                    chartType: ChartType.CARTESIAN,
                }),
            ),
        );

        await waitFor(() => {
            expect(result.current.queryResults.columns).toHaveProperty(
                'payments_total_revenue',
            );
        });

        const createRequests = mockApi.mock.calls.filter(
            ([request]) =>
                request.url === `/projects/${projectUuid}/query/metric-query`,
        );
        // The pivoted chart also runs an intentional unpivoted query for the
        // Results table. The third request rebinds an already-selected metric;
        // the fourth is the cartesian chart refresh.
        expect(createRequests).toHaveLength(4);
        expect(JSON.parse(createRequests[0][0].body as string)).toMatchObject({
            pivotConfiguration: expect.any(Object),
        });
        expect(JSON.parse(createRequests[2][0].body as string)).toMatchObject({
            pivotConfiguration: {
                valuesColumns: [
                    {
                        reference: 'payments_total_cost',
                    },
                ],
            },
        });
        expect(
            JSON.parse(createRequests[3][0].body as string),
        ).not.toHaveProperty('pivotConfiguration');
    });
});
