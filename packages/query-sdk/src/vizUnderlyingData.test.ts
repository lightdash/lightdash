import { describe, expect, it, vi } from 'vitest';
import { createApiTransport, type FetchAdapter } from './apiTransport';
import { VIZ_DRILL_DOWN_PATH, VIZ_UNDERLYING_DATA_PATH } from './types';

const CONFIG = { baseUrl: '', projectUuid: 'p1', apiKey: 'key' };

const INTENT = {
    row: {
        orders_status: { value: { raw: 'completed', formatted: 'Completed' } },
    },
    metric: 'value',
};

const EXEC_RESULT = {
    queryUuid: 'q2',
    metricQuery: {},
    fields: {
        orders_amount: { fieldType: 'metric', type: 'sum', label: 'Amount' },
    },
};

const READY_PAGE = {
    status: 'ready',
    queryUuid: 'q2',
    columns: {
        orders_amount: { reference: 'orders_amount', type: 'sum' },
        orders_status: { reference: 'orders_status', type: 'string' },
    },
    rows: [
        {
            orders_amount: { value: { raw: 100, formatted: '$100' } },
            orders_status: {
                value: { raw: 'completed', formatted: 'Completed' },
            },
        },
    ],
    totalResults: 1,
};

describe('getVizUnderlyingData', () => {
    it('POSTs the intent to the virtual path, then polls and maps the result', async () => {
        const fetchFn = vi.fn(async (method: string, path: string) => {
            if (method === 'POST' && path === VIZ_UNDERLYING_DATA_PATH) {
                return EXEC_RESULT;
            }
            if (
                method === 'GET' &&
                path.startsWith('/api/v2/projects/p1/query/q2')
            ) {
                return READY_PAGE;
            }
            throw new Error(`Unexpected request: ${method} ${path}`);
        }) as FetchAdapter;

        const transport = createApiTransport(CONFIG, fetchFn);
        const result = await transport.getVizUnderlyingData!(INTENT);

        expect(fetchFn).toHaveBeenCalledWith(
            'POST',
            VIZ_UNDERLYING_DATA_PATH,
            INTENT,
        );
        expect(result.queryUuid).toBe('q2');
        // Rows keyed by fieldId (identity fieldNameForId), raw values.
        expect(result.rows).toEqual([
            { orders_amount: 100, orders_status: 'completed' },
        ]);
        expect(result.columns).toContainEqual({
            name: 'orders_amount',
            label: 'Amount',
            type: 'number',
        });
        expect(result.format(result.rows[0], 'orders_amount')).toBe('$100');
    });

    it('surfaces the bridge error message when the virtual route rejects', async () => {
        const fetchFn = vi.fn(async () => {
            throw new Error(
                'Underlying data is not available for this visualization.',
            );
        }) as FetchAdapter;

        const transport = createApiTransport(CONFIG, fetchFn);
        await expect(transport.getVizUnderlyingData!(INTENT)).rejects.toThrow(
            'Underlying data is not available for this visualization.',
        );
    });
});

describe('openVizDrillDown', () => {
    it('POSTs the intent to the drill virtual path and resolves void', async () => {
        const fetchFn = vi.fn(async (method: string, path: string) => {
            if (method === 'POST' && path === VIZ_DRILL_DOWN_PATH) {
                return {};
            }
            throw new Error(`Unexpected request: ${method} ${path}`);
        }) as FetchAdapter;

        const transport = createApiTransport(CONFIG, fetchFn);
        const result = await transport.openVizDrillDown!(INTENT);

        expect(fetchFn).toHaveBeenCalledWith(
            'POST',
            VIZ_DRILL_DOWN_PATH,
            INTENT,
        );
        expect(result).toBeUndefined();
    });

    it('surfaces the bridge error message when the virtual route rejects', async () => {
        const fetchFn = vi.fn(async () => {
            throw new Error(
                'Drill-down is not available for this visualization.',
            );
        }) as FetchAdapter;

        const transport = createApiTransport(CONFIG, fetchFn);
        await expect(transport.openVizDrillDown!(INTENT)).rejects.toThrow(
            'Drill-down is not available for this visualization.',
        );
    });
});

describe('downloadVizUnderlyingData', () => {
    it('schedules the export against the returned queryUuid', async () => {
        const calls: Array<{ method: string; path: string; body?: unknown }> =
            [];
        const fetchFn = vi.fn(
            async (method: string, path: string, body?: unknown) => {
                calls.push({ method, path, body });
                if (method === 'POST' && path === VIZ_UNDERLYING_DATA_PATH) {
                    return EXEC_RESULT;
                }
                if (
                    method === 'GET' &&
                    path.startsWith('/api/v2/projects/p1/query/q2')
                ) {
                    return READY_PAGE;
                }
                if (
                    method === 'POST' &&
                    path === '/api/v2/projects/p1/query/q2/schedule-download'
                ) {
                    return { jobId: 'job-1' };
                }
                if (
                    method === 'GET' &&
                    path === '/api/v1/schedulers/job/job-1/status'
                ) {
                    return {
                        status: 'completed',
                        details: {
                            fileUrl: 'https://files/x.csv',
                            truncated: false,
                        },
                    };
                }
                throw new Error(`Unexpected request: ${method} ${path}`);
            },
        ) as FetchAdapter;

        const transport = createApiTransport(CONFIG, fetchFn);
        const result = await transport.downloadVizUnderlyingData!(INTENT, {
            limit: 'all',
            autoDownload: false,
        });

        // limit 'all' → null in the intent body (backend's "no limit").
        expect(calls[0]).toEqual({
            method: 'POST',
            path: VIZ_UNDERLYING_DATA_PATH,
            body: { ...INTENT, limit: null },
        });
        expect(result).toEqual({
            queryUuid: 'q2',
            jobId: 'job-1',
            fileUrl: 'https://files/x.csv',
            fileType: 'csv',
            truncated: false,
        });
    });
});
