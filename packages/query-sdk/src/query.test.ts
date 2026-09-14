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

describe('query metric filters', () => {
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
