import { describe, expect, it } from 'vitest';
import { createApiTransport } from './apiTransport';
import { savedChart } from './savedChart';

describe('savedChart', () => {
    it('builds a SavedChartQuery with the chart uuid', () => {
        const q = savedChart('chart-1');
        expect(q.kind).toBe('savedChart');
        expect(q.chartUuid).toBe('chart-1');
        expect(q.labelText).toBeUndefined();
    });
    it('accepts a label via the second argument', () => {
        expect(savedChart('chart-1', 'Revenue').labelText).toBe('Revenue');
    });
    it('exposes a chainable .label() (regression: the agent calls .label() on every query)', () => {
        // A plain object had no .label() method → `.label is not a function`
        // crashed generated apps. It must be chainable like QueryBuilder.
        expect(typeof savedChart('chart-1').label).toBe('function');
        const q = savedChart('chart-1').label('Revenue');
        expect(q.kind).toBe('savedChart');
        expect(q.chartUuid).toBe('chart-1');
        expect(q.labelText).toBe('Revenue');
    });
});

describe('executeSavedChart transport', () => {
    it('POSTs /query/chart with the chartUuid and maps the polled rows', async () => {
        const calls: Array<{ method: string; path: string; body?: unknown }> = [];
        const adapter = async (method: string, path: string, body?: unknown) => {
            calls.push({ method, path, body });
            if (method === 'POST' && path.endsWith('/query/chart')) {
                return { queryUuid: 'q-1', metricQuery: {}, fields: {} } as any;
            }
            // GET poll → ready with one row
            return {
                status: 'ready',
                columns: { orders_count: { reference: 'orders_count', type: 'number' } },
                rows: [{ orders_count: { value: { raw: 5, formatted: '5' } } }],
                totalResults: 1,
                nextPage: undefined,
            } as any;
        };
        const transport = createApiTransport(
            { apiKey: '', baseUrl: '', projectUuid: 'p-1' },
            adapter as any,
        );
        const result = await transport.executeSavedChart({ chartUuid: 'chart-9' });
        expect(calls[0]).toMatchObject({
            method: 'POST',
            path: '/api/v2/projects/p-1/query/chart',
            body: { chartUuid: 'chart-9' },
        });
        expect(result.queryUuid).toBe('q-1');
        expect(result.rows.length).toBe(1);
    });
});
