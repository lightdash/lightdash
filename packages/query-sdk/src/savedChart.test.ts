import { describe, expect, it } from 'vitest';
import { createApiTransport, type FetchAdapter } from './apiTransport';
import { savedChart } from './savedChart';

describe('savedChart', () => {
    it('builds a saved-chart query with the chart uuid', () => {
        const q = savedChart('chart-1');
        expect(q.kind).toBe('savedChart');
        expect(q.chartUuid).toBe('chart-1');
        expect(q.labelText).toBeUndefined();
    });

    it('accepts a label via the second argument', () => {
        expect(savedChart('chart-1', 'Revenue').labelText).toBe('Revenue');
    });

    // REGRESSION (battle-tested): generated apps chain the FULL QueryBuilder API
    // on a linked chart. A missing method throws `TypeError: X is not a function`
    // and crashes the whole app. Every QueryBuilder method must exist + chain.
    it('mirrors the full QueryBuilder chainable surface without crashing', () => {
        const chained = savedChart('chart-1')
            .label('Revenue')
            .dimensions(['orders_status'])
            .metrics(['orders_revenue'])
            .filters([])
            .sorts([])
            .tableCalculations([])
            .additionalMetrics([])
            .customDimensions([])
            .parameters({ region: 'US' })
            .limit(25);

        expect(chained.kind).toBe('savedChart');
        expect(chained.chartUuid).toBe('chart-1');
    });

    it('honors label/limit/parameters and ignores structural methods', () => {
        const q = savedChart('chart-1')
            .dimensions(['ignored'])
            .filters([])
            .label('Rev')
            .limit(10)
            .parameters({ region: 'US' });
        expect(q.labelText).toBe('Rev');
        expect(q.limitValue).toBe(10);
        expect(q.parameterValues).toEqual({ region: 'US' });
    });
});

describe('executeSavedChart transport', () => {
    it('POSTs /query/chart with the chartUuid and maps the polled rows', async () => {
        const calls: Array<{ method: string; path: string; body?: unknown }> =
            [];
        const adapter = async (
            method: string,
            path: string,
            body?: unknown,
        ) => {
            calls.push({ method, path, body });
            if (method === 'POST' && path.endsWith('/query/chart')) {
                return { queryUuid: 'q-1', metricQuery: {}, fields: {} } as any;
            }
            // GET poll → ready with one row
            return {
                status: 'ready',
                columns: {
                    orders_count: { reference: 'orders_count', type: 'number' },
                },
                rows: [{ orders_count: { value: { raw: 5, formatted: '5' } } }],
                totalResults: 1,
                nextPage: undefined,
            } as any;
        };
        const transport = createApiTransport(
            { apiKey: '', baseUrl: '', projectUuid: 'p-1' },
            adapter as any,
        );
        const result = await transport.executeSavedChart({
            chartUuid: 'chart-9',
        });
        expect(calls[0]).toMatchObject({
            method: 'POST',
            path: '/api/v2/projects/p-1/query/chart',
            body: { chartUuid: 'chart-9' },
        });
        expect(result.queryUuid).toBe('q-1');
        expect(result.rows.length).toBe(1);
    });
});

describe('savedChart filters', () => {
    it('captures .filters() into filterValues (accumulating, chainable)', () => {
        const q = savedChart('chart-1')
            .filters([
                { field: 'orders_status', operator: 'equals', value: 'done' },
            ])
            .filters([
                { field: 'orders_region', operator: 'equals', value: 'EU' },
            ]);
        expect(q.filterValues).toHaveLength(2);
        expect(q.filterValues?.[0]).toMatchObject({
            fieldId: 'orders_status',
            operator: 'equals',
            values: ['done'],
        });
    });

    it('keeps field ids as-is (qualified) — no explore-name stripping', () => {
        const q = savedChart('chart-1').filters([
            {
                field: 'orders_shipping_method',
                operator: 'equals',
                value: 'overnight',
            },
        ]);
        expect(q.filterValues?.[0].fieldId).toBe('orders_shipping_method');
    });

    it('includes filters in the useLightdash query key', async () => {
        const { savedChartQueryKey } = await import('./savedChart');
        const base = savedChart('chart-1').limit(10);
        const filtered = base.filters([
            { field: 'orders_status', operator: 'equals', value: 'done' },
        ]);
        expect(savedChartQueryKey(base)).not.toBe(savedChartQueryKey(filtered));
        expect(savedChartQueryKey(filtered)).toBe(savedChartQueryKey(filtered));
    });
});

describe('executeSavedChart filters payload', () => {
    it('sends converted filters on the POST body', async () => {
        const calls: Array<{ method: string; path: string; body?: unknown }> =
            [];
        const adapter: FetchAdapter = async <T>(
            method: string,
            path: string,
            body?: unknown,
        ): Promise<T> => {
            calls.push({ method, path, body });
            if (method === 'POST' && path.endsWith('/query/chart')) {
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
        await transport.executeSavedChart({
            chartUuid: 'chart-9',
            filters: [
                {
                    fieldId: 'orders_status',
                    operator: 'equals',
                    values: ['done'],
                    settings: null,
                },
            ],
        });
        expect(calls[0].body).toMatchObject({
            chartUuid: 'chart-9',
            filters: {
                dimensions: {
                    and: [
                        expect.objectContaining({
                            target: { fieldId: 'orders_status' },
                            operator: 'equals',
                            values: ['done'],
                        }),
                    ],
                },
            },
        });
    });

    it('omits filters from the body when none are set', async () => {
        const calls: Array<{ body?: unknown }> = [];
        const adapter: FetchAdapter = async <T>(
            method: string,
            path: string,
            body?: unknown,
        ): Promise<T> => {
            calls.push({ body });
            if (method === 'POST' && path.endsWith('/query/chart')) {
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
        await transport.executeSavedChart({ chartUuid: 'chart-9' });
        expect(calls[0].body).not.toHaveProperty('filters');
    });
});
