import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createApiTransport,
    createFieldQualifier,
    createHostExploreBaseTableResolver,
    type ExploreBaseTableResolver,
    type FetchAdapter,
} from './apiTransport';
import { query } from './query';
import type { QueryDefinition } from './types';

const CONFIG = { apiKey: 'key', baseUrl: 'http://ld', projectUuid: 'p-1' };

type Call = { method: string; path: string; body?: unknown };

const renamedExploreQuery = (): QueryDefinition =>
    query('orders_with_custom_dims')
        .dimensions(['status'])
        .metrics(['total_order_amount'])
        .filters([{ field: 'status', operator: 'equals', value: 'completed' }])
        .sorts([{ field: 'total_order_amount', direction: 'desc' }])
        .limit(3)
        .build();

const createFakeAdapter = (calls: Call[]): FetchAdapter =>
    async function fakeAdapter<T>(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<T> {
        calls.push({ method, path, body });
        if (method === 'POST') {
            return { queryUuid: 'q-1', metricQuery: {}, fields: {} } as T;
        }
        return {
            status: 'ready',
            columns: {
                orders_status: { reference: 'orders_status', type: 'string' },
                orders_total_order_amount: {
                    reference: 'orders_total_order_amount',
                    type: 'number',
                },
            },
            rows: [
                {
                    orders_status: {
                        value: { raw: 'completed', formatted: 'completed' },
                    },
                    orders_total_order_amount: {
                        value: { raw: 42, formatted: '42' },
                    },
                },
            ],
            totalResults: 1,
        } as T;
    };

const metricQueryBody = (calls: Call[]) => {
    const post = calls.find(
        (c) => c.method === 'POST' && c.path.endsWith('/query/metric-query'),
    );
    return (post?.body as { query: Record<string, unknown> }).query;
};

describe('createFieldQualifier', () => {
    const qualify = createFieldQualifier(
        'orders_with_custom_dims',
        'orders',
        [],
    );

    it('prefixes short names with the base table', () => {
        expect(qualify('status')).toBe('orders_status');
    });

    it('passes through names already qualified with the base table', () => {
        expect(qualify('orders_status')).toBe('orders_status');
    });

    it('converts dot notation', () => {
        expect(qualify('orders.status')).toBe('orders_status');
    });

    it('prefixes a short name that starts with the explore name', () => {
        const sales = createFieldQualifier('sales', 'sales_orders', []);
        expect(sales('sales_amount')).toBe('sales_orders_sales_amount');
    });

    it('is unchanged for a normal explore', () => {
        const normal = createFieldQualifier('orders', 'orders', []);
        expect(normal('status')).toBe('orders_status');
        expect(normal('orders_status')).toBe('orders_status');
        expect(normal('customers.first_name')).toBe('customers_first_name');
    });

    it('falls back to the explore name when the base table is unknown', () => {
        const fallback = createFieldQualifier(
            'orders_with_custom_dims',
            null,
            [],
        );
        expect(fallback('status')).toBe('orders_with_custom_dims_status');
        expect(fallback('orders_with_custom_dims_status')).toBe(
            'orders_with_custom_dims_status',
        );
    });
});

describe('createFieldQualifier with custom dimensions', () => {
    it('resolves a short name to a custom dimension id written with either prefix', () => {
        const withExplorePrefix = createFieldQualifier(
            'orders_with_custom_dims',
            'orders',
            ['orders_with_custom_dims_status_label'],
        );
        expect(withExplorePrefix('status_label')).toBe(
            'orders_with_custom_dims_status_label',
        );
        expect(withExplorePrefix('orders_with_custom_dims_status_label')).toBe(
            'orders_with_custom_dims_status_label',
        );

        const withBasePrefix = createFieldQualifier(
            'orders_with_custom_dims',
            'orders',
            ['orders_status_label'],
        );
        expect(withBasePrefix('status_label')).toBe('orders_status_label');
    });

    it('is unchanged for a normal explore', () => {
        const normal = createFieldQualifier('orders', 'orders', [
            'orders_status_label',
        ]);
        expect(normal('status_label')).toBe('orders_status_label');
        expect(normal('status')).toBe('orders_status');
    });
});

describe('api transport on an explore defined under meta.explores', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('qualifies every field against the resolved base table and keys rows by short names', async () => {
        const calls: Call[] = [];
        const resolver: ExploreBaseTableResolver = vi.fn(async () => 'orders');
        const transport = createApiTransport(CONFIG, createFakeAdapter(calls), {
            resolveExploreBaseTable: resolver,
        });

        const result = await transport.executeQuery(renamedExploreQuery());

        const body = metricQueryBody(calls);
        expect(body.exploreName).toBe('orders_with_custom_dims');
        expect(body.dimensions).toEqual(['orders_status']);
        expect(body.metrics).toEqual(['orders_total_order_amount']);
        expect(body.sorts).toEqual([
            { fieldId: 'orders_total_order_amount', descending: true },
        ]);
        expect(body.filters).toMatchObject({
            dimensions: { and: [{ target: { fieldId: 'orders_status' } }] },
        });
        expect(result.rows).toEqual([
            { status: 'completed', total_order_amount: 42 },
        ]);
        expect(result.rowKeys).toEqual({
            orders_status: 'status',
            orders_total_order_amount: 'total_order_amount',
        });
    });

    it('qualifies metric filters against the base table', async () => {
        const calls: Call[] = [];
        const transport = createApiTransport(CONFIG, createFakeAdapter(calls), {
            resolveExploreBaseTable: async () => 'orders',
        });

        await transport.executeQuery({
            ...renamedExploreQuery(),
            metricFilters: [
                {
                    fieldId: 'total_order_amount',
                    operator: 'greaterThan',
                    values: [10],
                    settings: null,
                },
            ],
        });

        expect(metricQueryBody(calls).filters).toMatchObject({
            metrics: {
                and: [{ target: { fieldId: 'orders_total_order_amount' } }],
            },
        });
    });

    it('resolves the base table once per explore, sharing concurrent lookups', async () => {
        const calls: Call[] = [];
        const resolver = vi.fn(async () => 'orders');
        const transport = createApiTransport(CONFIG, createFakeAdapter(calls), {
            resolveExploreBaseTable: resolver,
        });

        await Promise.all([
            transport.executeQuery(renamedExploreQuery()),
            transport.executeQuery(renamedExploreQuery()),
        ]);
        await transport.executeQuery(renamedExploreQuery());

        expect(resolver).toHaveBeenCalledTimes(1);
        expect(resolver).toHaveBeenCalledWith('orders_with_custom_dims');
    });

    it('qualifies underlying-data requests against the base table', async () => {
        const calls: Call[] = [];
        const transport = createApiTransport(CONFIG, createFakeAdapter(calls), {
            resolveExploreBaseTable: async () => 'orders',
        });
        const result = await transport.executeQuery(renamedExploreQuery());

        await result.getUnderlyingData?.({
            metric: 'total_order_amount',
            row: result.rows[0],
        });

        const underlying = calls.find((c) =>
            c.path.endsWith('/query/underlying-data'),
        );
        expect(underlying?.body).toMatchObject({
            underlyingDataItemId: 'orders_total_order_amount',
        });
        expect(JSON.stringify(underlying?.body)).not.toContain(
            'orders_with_custom_dims_',
        );
    });

    it('falls back to prefixing with the explore name when the base table is unknown', async () => {
        const calls: Call[] = [];
        const transport = createApiTransport(CONFIG, createFakeAdapter(calls), {
            resolveExploreBaseTable: async () => null,
        });

        await transport.executeQuery(renamedExploreQuery());

        expect(metricQueryBody(calls).dimensions).toEqual([
            'orders_with_custom_dims_status',
        ]);
    });

    it('falls back when the resolver throws', async () => {
        const calls: Call[] = [];
        const transport = createApiTransport(CONFIG, createFakeAdapter(calls), {
            resolveExploreBaseTable: async () => {
                throw new Error('boom');
            },
        });

        await transport.executeQuery(renamedExploreQuery());

        expect(metricQueryBody(calls).dimensions).toEqual([
            'orders_with_custom_dims_status',
        ]);
    });

    it('keeps today’s behaviour for a custom adapter without a resolver', async () => {
        const calls: Call[] = [];
        const transport = createApiTransport(CONFIG, createFakeAdapter(calls));

        await transport.executeQuery(renamedExploreQuery());

        expect(calls.some((c) => c.path.includes('/explores/'))).toBe(false);
        expect(metricQueryBody(calls).dimensions).toEqual([
            'orders_with_custom_dims_status',
        ]);
    });
});

describe('default (PAT) api transport base-table lookup', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const jsonResponse = (status: number, json: unknown) =>
        ({
            ok: status >= 200 && status < 300,
            status,
            json: async () => json,
            text: async () => JSON.stringify(json),
        }) as Response;

    const stubFetch = (exploreResponse: Response) => {
        const fetchMock = vi.fn(
            async (url: string, init?: RequestInit): Promise<Response> => {
                if (url.includes('/explores/')) return exploreResponse;
                if (init?.method === 'POST') {
                    return jsonResponse(200, {
                        status: 'ok',
                        results: {
                            queryUuid: 'q-1',
                            metricQuery: {},
                            fields: {},
                        },
                    });
                }
                return jsonResponse(200, {
                    status: 'ok',
                    results: {
                        status: 'ready',
                        columns: {},
                        rows: [],
                        totalResults: 0,
                    },
                });
            },
        );
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    };

    const postedDimensions = (fetchMock: ReturnType<typeof stubFetch>) => {
        const post = fetchMock.mock.calls.find(
            ([, init]) => init?.method === 'POST',
        );
        return JSON.parse(String(post?.[1]?.body)).query.dimensions;
    };

    it('reads the base table from the explore endpoint', async () => {
        const fetchMock = stubFetch(
            jsonResponse(200, {
                status: 'ok',
                results: {
                    name: 'orders_with_custom_dims',
                    baseTable: 'orders',
                },
            }),
        );
        const transport = createApiTransport(CONFIG);

        await transport.executeQuery(renamedExploreQuery());

        expect(fetchMock.mock.calls[0][0]).toBe(
            'http://ld/api/v1/projects/p-1/explores/orders_with_custom_dims',
        );
        expect(postedDimensions(fetchMock)).toEqual(['orders_status']);
    });

    it('falls back when the explore endpoint errors', async () => {
        const fetchMock = stubFetch(
            jsonResponse(403, {
                status: 'error',
                error: { message: 'Forbidden' },
            }),
        );
        const transport = createApiTransport(CONFIG);

        await transport.executeQuery(renamedExploreQuery());

        expect(postedDimensions(fetchMock)).toEqual([
            'orders_with_custom_dims_status',
        ]);
    });
});

describe('host explore base-table resolver', () => {
    const adapterReturning =
        (calls: Call[], respond: () => Promise<unknown>): FetchAdapter =>
        async <T>(method: string, path: string, body?: unknown) => {
            calls.push({ method, path, body });
            return (await respond()) as T;
        };

    it('posts the explore name to the host virtual route', async () => {
        const calls: Call[] = [];
        const resolve = createHostExploreBaseTableResolver(
            adapterReturning(calls, async () => ({ baseTable: 'orders' })),
        );

        await expect(resolve('orders_with_custom_dims')).resolves.toBe(
            'orders',
        );
        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/__sdk/explore-base-table',
                body: { exploreName: 'orders_with_custom_dims' },
            },
        ]);
    });

    it('resolves null when the host does not know the base table', async () => {
        const resolve = createHostExploreBaseTableResolver(
            adapterReturning([], async () => ({ baseTable: null })),
        );
        await expect(resolve('orders_with_custom_dims')).resolves.toBeNull();
    });

    it('falls back to the explore name when an older host blocks the route', async () => {
        const calls: Call[] = [];
        const fake = createFakeAdapter(calls);
        const adapter: FetchAdapter = async <T>(
            method: string,
            path: string,
            body?: unknown,
        ) => {
            if (path.endsWith('/__sdk/explore-base-table')) {
                calls.push({ method, path, body });
                throw new Error(`Blocked: ${method} ${path}`);
            }
            return fake<T>(method, path, body);
        };
        const transport = createApiTransport(CONFIG, adapter, {
            resolveExploreBaseTable:
                createHostExploreBaseTableResolver(adapter),
        });

        await transport.executeQuery(renamedExploreQuery());

        expect(metricQueryBody(calls).dimensions).toEqual([
            'orders_with_custom_dims_status',
        ]);
    });

    it('qualifies with the base table the host returns', async () => {
        const calls: Call[] = [];
        const fake = createFakeAdapter(calls);
        const adapter: FetchAdapter = async <T>(
            method: string,
            path: string,
            body?: unknown,
        ) =>
            path.endsWith('/__sdk/explore-base-table')
                ? ({ baseTable: 'orders' } as T)
                : fake<T>(method, path, body);
        const transport = createApiTransport(CONFIG, adapter, {
            resolveExploreBaseTable:
                createHostExploreBaseTableResolver(adapter),
        });

        await transport.executeQuery(renamedExploreQuery());

        expect(metricQueryBody(calls).dimensions).toEqual(['orders_status']);
    });
});

describe('default api transport behind a dev proxy', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const jsonResponse = (status: number, json: unknown) =>
        ({
            ok: status >= 200 && status < 300,
            status,
            json: async () => json,
            text: async () => JSON.stringify(json),
        }) as Response;

    const stubFetch = (baseTableResponse: Response) => {
        const fetchMock = vi.fn(
            async (url: string, init?: RequestInit): Promise<Response> => {
                if (url.endsWith('/__sdk/explore-base-table')) {
                    return baseTableResponse;
                }
                if (init?.method === 'POST') {
                    return jsonResponse(200, {
                        status: 'ok',
                        results: {
                            queryUuid: 'q-1',
                            metricQuery: {},
                            fields: {},
                        },
                    });
                }
                return jsonResponse(200, {
                    status: 'ok',
                    results: {
                        status: 'ready',
                        columns: {},
                        rows: [],
                        totalResults: 0,
                    },
                });
            },
        );
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    };

    const postedDimensions = (fetchMock: ReturnType<typeof stubFetch>) => {
        const post = fetchMock.mock.calls.find(([url]) =>
            url.endsWith('/query/metric-query'),
        );
        return JSON.parse(String(post?.[1]?.body)).query.dimensions;
    };

    it('asks the proxy through the host route instead of the explore endpoint', async () => {
        const fetchMock = stubFetch(
            jsonResponse(200, {
                status: 'ok',
                results: { baseTable: 'orders' },
            }),
        );
        const transport = createApiTransport({ ...CONFIG, useProxy: true });

        await transport.executeQuery(renamedExploreQuery());

        expect(fetchMock.mock.calls[0][0]).toBe('/__sdk/explore-base-table');
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
            exploreName: 'orders_with_custom_dims',
        });
        expect(
            fetchMock.mock.calls.some(([url]) => url.includes('/explores/')),
        ).toBe(false);
        expect(postedDimensions(fetchMock)).toEqual(['orders_status']);
    });

    it('falls back when an older proxy rejects the route', async () => {
        const fetchMock = stubFetch(
            jsonResponse(403, {
                status: 'error',
                error: { message: 'Route not allowed' },
            }),
        );
        const transport = createApiTransport({ ...CONFIG, useProxy: true });

        await transport.executeQuery(renamedExploreQuery());

        expect(postedDimensions(fetchMock)).toEqual([
            'orders_with_custom_dims_status',
        ]);
    });
});
