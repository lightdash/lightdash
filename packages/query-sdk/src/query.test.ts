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

describe('result pagination', () => {
    const TOTAL = 6200;
    const allRows = Array.from({ length: TOTAL }, (_, i) => ({
        orders_id: { value: { raw: i, formatted: String(i) } },
    }));

    const createPagedAdapter = ({
        maxPageSize = 2500,
        failPage,
    }: { maxPageSize?: number; failPage?: number } = {}) => {
        const pageCalls: Array<{ page: number; pageSize: number }> = [];
        let inFlight = 0;
        let maxInFlight = 0;
        const adapter: FetchAdapter = async <T>(
            method: string,
            path: string,
        ): Promise<T> => {
            if (method === 'POST') {
                return { queryUuid: 'q-1', metricQuery: {}, fields: {} } as T;
            }
            const params = new URLSearchParams(path.split('?')[1]);
            const page = Number(params.get('page'));
            const pageSize = Number(params.get('pageSize'));
            pageCalls.push({ page, pageSize });
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            // Later pages settle first, so ordering can't come from timing.
            await new Promise((resolve) => {
                setTimeout(resolve, 20 - page);
            });
            inFlight -= 1;
            if (pageSize > maxPageSize) {
                throw new Error(
                    `page size is too large, max is ${maxPageSize}`,
                );
            }
            if (page === failPage && pageSize !== 500) {
                throw new Error('page failed');
            }
            const pageCount = Math.ceil(TOTAL / pageSize);
            return {
                status: 'ready',
                queryUuid: 'q-1',
                columns: {},
                rows: allRows.slice((page - 1) * pageSize, page * pageSize),
                totalResults: TOTAL,
                nextPage: page < pageCount ? page + 1 : undefined,
            } as T;
        };
        return {
            adapter,
            pageCalls,
            getMaxInFlight: () => maxInFlight,
        };
    };

    const run = (adapter: FetchAdapter) =>
        createApiTransport(
            { apiKey: '', baseUrl: '', projectUuid: 'p-1' },
            adapter,
        ).executeQuery(query('orders').dimensions(['id']).limit(TOTAL).build());

    it('loads the remaining rows in large pages, in order', async () => {
        const { adapter, pageCalls } = createPagedAdapter();

        const result = await run(adapter);

        expect(result.rows.map((row) => row.id)).toEqual(
            allRows.map((_, i) => i),
        );
        expect(pageCalls).toEqual([
            { page: 1, pageSize: 500 },
            { page: 1, pageSize: 2500 },
            { page: 2, pageSize: 2500 },
            { page: 3, pageSize: 2500 },
        ]);
    });

    it('falls back to default pages, a few at a time, when the host caps page size lower', async () => {
        const { adapter, pageCalls, getMaxInFlight } = createPagedAdapter({
            maxPageSize: 500,
        });

        const result = await run(adapter);

        expect(result.rows.map((row) => row.id)).toEqual(
            allRows.map((_, i) => i),
        );
        expect(pageCalls.filter((call) => call.pageSize === 500)).toHaveLength(
            13,
        );
        expect(getMaxInFlight()).toBe(4);
    });

    it('rejects when a page fails', async () => {
        const { adapter } = createPagedAdapter({ failPage: 2 });

        await expect(run(adapter)).rejects.toThrow('page failed');
    });

    it('makes no extra request when the first page holds every row', async () => {
        const calls: string[] = [];
        const adapter: FetchAdapter = async <T>(
            method: string,
            path: string,
        ): Promise<T> => {
            calls.push(`${method} ${path}`);
            if (method === 'POST') {
                return { queryUuid: 'q-1', metricQuery: {}, fields: {} } as T;
            }
            return {
                status: 'ready',
                queryUuid: 'q-1',
                columns: {},
                rows: allRows.slice(0, 500),
                totalResults: 500,
                nextPage: undefined,
            } as T;
        };

        const result = await run(adapter);

        expect(result.rows).toHaveLength(500);
        expect(calls).toHaveLength(2);
    });
});
