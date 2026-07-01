import { describe, expect, it } from 'vitest';
import { createApiTransport } from './apiTransport';
import { savedChart } from './savedChart';

describe('savedChart', () => {
    it('builds a SavedChartQuery with the chart uuid', () => {
        expect(savedChart('chart-1')).toEqual({
            kind: 'savedChart',
            chartUuid: 'chart-1',
        });
    });
    it('carries an optional label', () => {
        expect(savedChart('chart-1', 'Revenue')).toEqual({
            kind: 'savedChart',
            chartUuid: 'chart-1',
            label: 'Revenue',
        });
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
