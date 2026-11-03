import { describe, expect, it } from 'vitest';
import { createApiTransport, type FetchAdapter } from './apiTransport';
import { query } from './query';
import type { QueryDefinition } from './types';

const executeAndGetBody = async (
    queryDefinition: QueryDefinition,
): Promise<Record<string, unknown>> => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const adapter: FetchAdapter = async <T>(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<T> => {
        calls.push({ method, path, body });
        if (method === 'POST' && path.endsWith('/query/metric-query')) {
            return { queryUuid: 'q-1', metricQuery: {}, fields: {} } as T;
        }
        return {
            status: 'ready',
            columns: {},
            rows: [],
            totalResults: 0,
            nextPage: undefined,
        } as T;
    };
    const transport = createApiTransport(
        { apiKey: '', baseUrl: '', projectUuid: 'p-1' },
        adapter,
    );

    await transport.executeQuery(queryDefinition);
    return calls[0].body as Record<string, unknown>;
};

describe('query execution', () => {
    it('fetches result pages in bounded parallel batches while preserving order', async () => {
        let activeRequests = 0;
        let maxActiveRequests = 0;
        const requestedPages: number[] = [];
        const adapter: FetchAdapter = async <T>(
            method: string,
            path: string,
        ): Promise<T> => {
            if (method === 'POST') {
                return {
                    queryUuid: 'q-1',
                    fields: {},
                } as T;
            }

            const page = Number(
                new URL(`https://lightdash.test${path}`).searchParams.get(
                    'page',
                ),
            );
            requestedPages.push(page);
            activeRequests += 1;
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
            await new Promise((resolve) =>
                setTimeout(resolve, page === 2 ? 10 : 0),
            );
            activeRequests -= 1;

            if (page === 1) {
                return {
                    status: 'ready',
                    columns: { orders_status: { type: 'number' } },
                    rows: [
                        {
                            orders_status: {
                                value: { raw: 1, formatted: '1' },
                            },
                        },
                    ],
                    totalResults: 4500,
                    nextPage: 2,
                } as T;
            }

            return {
                status: 'ready',
                columns: { orders_status: { type: 'number' } },
                rows: [
                    {
                        orders_status: {
                            value: { raw: page, formatted: String(page) },
                        },
                    },
                ],
                totalResults: 4500,
                nextPage: page === 9 ? undefined : page + 1,
            } as T;
        };
        const transport = createApiTransport(
            { apiKey: '', baseUrl: '', projectUuid: 'p-1' },
            adapter,
        );

        const result = await transport.executeQuery(
            query('orders').dimensions(['status']).build(),
        );

        expect(result.rows).toEqual(
            Array.from({ length: 9 }, (_, index) => ({ status: index + 1 })),
        );
        expect(requestedPages).toContain(1);
        expect(requestedPages.slice(1)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
        expect(maxActiveRequests).toBeLessThanOrEqual(8);
    });

    it('propagates pagination failures instead of returning partial results', async () => {
        const adapter: FetchAdapter = async <T>(
            method: string,
            path: string,
        ): Promise<T> => {
            if (method === 'POST') {
                return {
                    queryUuid: 'q-1',
                    fields: {},
                } as T;
            }

            const page = Number(
                new URL(`https://lightdash.test${path}`).searchParams.get(
                    'page',
                ),
            );
            if (page === 1) {
                return {
                    status: 'ready',
                    columns: { orders_status: { type: 'string' } },
                    rows: [
                        {
                            orders_status: {
                                value: { raw: 'first', formatted: 'first' },
                            },
                        },
                    ],
                    totalResults: 1000,
                    nextPage: 2,
                } as T;
            }

            return {
                status: 'error',
                error: 'page unavailable',
            } as T;
        };
        const transport = createApiTransport(
            { apiKey: '', baseUrl: '', projectUuid: 'p-1' },
            adapter,
        );

        await expect(
            transport.executeQuery(
                query('orders').dimensions(['status']).build(),
            ),
        ).rejects.toThrow('Unexpected status while paginating results: error');
    });

    it('returns table calculation values, columns, and formatting without qualifying their names', async () => {
        const adapter: FetchAdapter = async <T>(method: string): Promise<T> => {
            if (method === 'POST') {
                return {
                    queryUuid: 'q-1',
                    fields: {
                        share: {
                            fieldType: 'table_calculation',
                            displayName: 'Share of orders',
                        },
                    },
                } as T;
            }
            return {
                status: 'ready',
                columns: {
                    orders_status: { type: 'string' },
                    orders_count: { type: 'number' },
                    share: { type: 'number' },
                },
                rows: [
                    {
                        orders_status: {
                            value: { raw: 'completed', formatted: 'completed' },
                        },
                        orders_count: { value: { raw: 97, formatted: '97' } },
                        share: { value: { raw: 64.238, formatted: '64.2%' } },
                    },
                ],
                totalResults: 1,
            } as T;
        };
        const transport = createApiTransport(
            { apiKey: '', baseUrl: '', projectUuid: 'p-1' },
            adapter,
        );
        const result = await transport.executeQuery(
            query('orders')
                .dimensions(['status'])
                .metrics(['count'])
                .tableCalculations([
                    {
                        name: 'share',
                        displayName: 'Share of orders',
                        sql: '100.0 * ${orders.count} / SUM(${orders.count}) OVER ()',
                    },
                ])
                .build(),
        );
        expect(result.rows).toEqual([
            { status: 'completed', count: 97, share: 64.238 },
        ]);
        expect(result.columns).toContainEqual({
            name: 'share',
            label: 'Share of orders',
            type: 'number',
            fieldId: 'share',
        });
        expect(result.rowKeys?.share).toBe('share');
        expect(result.format(result.rows[0], 'share')).toBe('64.2%');
    });

    it('serializes selected metric filters separately from dimension filters', async () => {
        const metricId = 'custom_roles_custom_roles_created';
        const body = await executeAndGetBody(
            query('custom_roles')
                .metrics([metricId])
                .filters([
                    {
                        field: 'created_at',
                        operator: 'notNull',
                    },
                ])
                .metricFilters([
                    {
                        field: metricId,
                        operator: 'greaterThanOrEqual',
                        value: 2,
                    },
                ])
                .build(),
        );

        expect(body).toMatchObject({
            query: {
                metrics: [metricId],
                filters: {
                    dimensions: {
                        and: [
                            expect.objectContaining({
                                target: {
                                    fieldId: 'custom_roles_created_at',
                                },
                            }),
                        ],
                    },
                    metrics: {
                        and: [
                            expect.objectContaining({
                                target: { fieldId: metricId },
                                operator: 'greaterThanOrEqual',
                                values: [2],
                            }),
                        ],
                    },
                },
            },
        });
    });

    it('qualifies base and joined filter-only metrics without selecting them', async () => {
        const body = await executeAndGetBody(
            query('orders')
                .dimensions(['status'])
                .metricFilters([
                    {
                        field: 'total_revenue',
                        operator: 'greaterThan',
                        value: 1000,
                    },
                    {
                        field: 'customers.customer_count',
                        operator: 'lessThanOrEqual',
                        value: 50,
                    },
                ])
                .build(),
        );
        const metricRules = (
            body.query as {
                metrics: string[];
                filters: {
                    metrics: { and: Array<{ target: { fieldId: string } }> };
                };
            }
        ).filters.metrics.and;

        expect((body.query as { metrics: string[] }).metrics).toEqual([]);
        expect(metricRules.map((rule) => rule.target.fieldId)).toEqual([
            'orders_total_revenue',
            'customers_customer_count',
        ]);
    });

    it('accumulates metric filters immutably', () => {
        const base = query('orders').metricFilters([
            {
                field: 'total_revenue',
                operator: 'greaterThan',
                value: 0,
            },
        ]);
        const extended = base.metricFilters([
            { field: 'order_count', operator: 'lessThan', value: 100 },
        ]);

        expect(base.build().metricFilters).toHaveLength(1);
        expect(extended.build().metricFilters).toHaveLength(2);
        expect(base.build().filters).toEqual([]);
    });

    it('accepts query definitions built before metric filters were added', async () => {
        const legacyDefinition = query('orders')
            .filters([{ field: 'status', operator: 'equals', value: 'paid' }])
            .build();
        delete legacyDefinition.metricFilters;

        const body = await executeAndGetBody(legacyDefinition);

        expect(body).toMatchObject({
            query: {
                filters: {
                    dimensions: expect.any(Object),
                },
            },
        });
        expect(
            (body.query as { filters: Record<string, unknown> }).filters,
        ).not.toHaveProperty('metrics');
    });
});
