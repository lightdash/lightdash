import { SupportedDbtAdapter, type MetricQuery } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import {
    WarehouseSignInPreflight,
    WarehouseSignInPreflightContext,
} from '../components/NavBar/warehouseSignInPreflight';
import { useCompiledSqlFromMetricQuery } from './useCompiledSql';
import { useMetricQueryCostEstimate } from './useQueryCostEstimate';
import { useGetReadyQueryResults } from './useQueryResults';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));
vi.mock('./useQueryError', () => ({ default: () => vi.fn() }));
const projectUuid = 'project_a';
const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 10,
    tableCalculations: [],
};
const executionHooks = [
    {
        name: 'metric execution',
        useExecution: () =>
            useGetReadyQueryResults(
                { projectUuid, tableId: 'orders', query: metricQuery },
                [],
            ),
    },
    {
        name: 'warehouse compile',
        useExecution: () =>
            useCompiledSqlFromMetricQuery({
                projectUuid,
                tableName: 'orders',
                metricQuery,
            }),
    },
    {
        name: 'metric cost',
        useExecution: () =>
            useMetricQueryCostEstimate(
                projectUuid,
                { query: metricQuery },
                true,
            ),
    },
];
beforeEach(() => vi.clearAllMocks());

test.each(
    executionHooks.flatMap((hook) =>
        [null, 'connection_extra'].map((binding) => ({ ...hook, binding })),
    ),
)(
    '$name waits for canonical Explore metadata and bound preflight: $binding',
    async ({ useExecution, binding }) => {
        const metadata = Promise.withResolvers<unknown>();
        api.mockImplementation(({ method }: { method: string }) =>
            method === 'GET'
                ? metadata.promise
                : Promise.resolve({
                      queryUuid: 'query_a',
                      query: 'select 1',
                      status: 'estimated',
                  }),
        );
        const preflight = new WarehouseSignInPreflight(
            { projectUuid, userUuid: 'user_a', pageGeneration: 'page_a' },
            true,
            false,
        );
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                <WarehouseSignInPreflightContext.Provider value={preflight}>
                    {children}
                </WarehouseSignInPreflightContext.Provider>
            </QueryClientProvider>
        );
        renderHook(
            () => {
                useExecution();
            },
            { wrapper },
        );
        await waitFor(() =>
            expect(api).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'GET',
                    url: `/projects/${projectUuid}/explores/orders`,
                }),
            ),
        );
        expect(preflight.checks.size).toBe(0);
        expect(
            api.mock.calls.some(([request]) => request.method === 'POST'),
        ).toBe(false);
        await act(async () =>
            metadata.resolve({
                name: 'orders',
                label: 'Orders',
                baseTable: 'orders',
                joinedTables: [],
                tables: {},
                targetDatabase: SupportedDbtAdapter.BIGQUERY,
                warehouseConnectionUuid: 'stored_connection',
                warehouseConnection: {
                    warehouseConnectionUuid: binding,
                    warehouseType: 'bigquery',
                    startOfWeek: null,
                },
            }),
        );
        const key = binding ?? 'original';
        await waitFor(() => expect(preflight.checks.has(key)).toBe(true));
        expect(preflight.checks.size).toBe(1);
        expect(preflight.checks.has('stored_connection')).toBe(false);
        expect(
            api.mock.calls.some(([request]) => request.method === 'POST'),
        ).toBe(false);
        await act(() =>
            preflight.settle(
                binding,
                preflight.checks.get(key)!.generation,
                null,
            ),
        );
        await waitFor(() =>
            expect(
                api.mock.calls.filter(([request]) => request.method === 'POST'),
            ).toHaveLength(1),
        );
        client.clear();
    },
);
