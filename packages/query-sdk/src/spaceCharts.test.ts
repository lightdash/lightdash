import { describe, expect, it } from 'vitest';
import {
    createApiSpaceChartsResolver,
    createApiTransport,
    createHostSpaceChartsResolver,
    LightdashApiError,
    normalizeSpaceChartsResult,
    type FetchAdapter,
} from './apiTransport';
import { SPACE_CHARTS_PATH } from './types';

const CHART = {
    uuid: 'chart-1',
    name: 'Revenue',
    description: 'Monthly revenue',
    chartKind: 'line',
    slug: 'revenue',
    updatedAt: '2026-10-29T00:00:00.000Z',
};

const SPACE = { uuid: 'space-1', name: 'Sales', slug: 'sales' };

describe('normalizeSpaceChartsResult', () => {
    it('keeps only well-formed fields and drops chart entries without identity', () => {
        expect(
            normalizeSpaceChartsResult({
                space: { ...SPACE, access: ['secret'] },
                charts: [
                    { ...CHART, views: 42 },
                    { uuid: 'chart-2', name: 'Orders', chartKind: 7 },
                    { name: 'no uuid' },
                    null,
                ],
            }),
        ).toEqual({
            space: SPACE,
            charts: [
                CHART,
                {
                    uuid: 'chart-2',
                    name: 'Orders',
                    description: null,
                    chartKind: null,
                    slug: null,
                    updatedAt: null,
                },
            ],
        });
    });

    it('answers empty for malformed bodies', () => {
        expect(normalizeSpaceChartsResult(null)).toEqual({
            space: null,
            charts: [],
        });
        expect(normalizeSpaceChartsResult({ space: { uuid: 'u' } })).toEqual({
            space: null,
            charts: [],
        });
    });
});

describe('createHostSpaceChartsResolver', () => {
    it('posts the virtual route and normalizes the answer', async () => {
        const calls: unknown[] = [];
        const fetchFn: FetchAdapter = async <T>(
            method: string,
            path: string,
            body?: unknown,
        ) => {
            calls.push([method, path, body]);
            return { space: SPACE, charts: [CHART] } as T;
        };
        await expect(
            createHostSpaceChartsResolver(fetchFn)('sales'),
        ).resolves.toEqual({ space: SPACE, charts: [CHART] });
        expect(calls).toEqual([
            ['POST', SPACE_CHARTS_PATH, { space: 'sales' }],
        ]);
    });
});

describe('createApiSpaceChartsResolver', () => {
    const spacesList = [
        { uuid: 'space-1', slug: 'sales' },
        { uuid: 'space-2', slug: 'marketing' },
    ];

    const fetchFor =
        (detail: unknown, calls: unknown[] = []): FetchAdapter =>
        async <T>(method: string, path: string, body?: unknown) => {
            calls.push([method, path, body]);
            if (path === '/api/v1/projects/proj-1/spaces')
                return spacesList as T;
            return detail as T;
        };

    it('matches by slug, then trims the space detail', async () => {
        const calls: unknown[] = [];
        const resolve = createApiSpaceChartsResolver(
            fetchFor({ ...SPACE, queries: [CHART] }, calls),
            'proj-1',
        );
        await expect(resolve('sales')).resolves.toEqual({
            space: SPACE,
            charts: [CHART],
        });
        expect(calls).toEqual([
            ['GET', '/api/v1/projects/proj-1/spaces', undefined],
            ['GET', '/api/v1/projects/proj-1/spaces/space-1', undefined],
        ]);
    });

    it('matches by uuid too', async () => {
        const resolve = createApiSpaceChartsResolver(
            fetchFor({ ...SPACE, queries: [] }),
            'proj-1',
        );
        await expect(resolve('space-1')).resolves.toEqual({
            space: SPACE,
            charts: [],
        });
    });

    it('answers empty for an unknown reference without fetching a detail', async () => {
        const calls: unknown[] = [];
        const resolve = createApiSpaceChartsResolver(
            fetchFor({ ...SPACE, queries: [CHART] }, calls),
            'proj-1',
        );
        await expect(resolve('missing')).resolves.toEqual({
            space: null,
            charts: [],
        });
        expect(calls).toHaveLength(1);
    });

    it('answers empty on 403/404 and rethrows other failures', async () => {
        const forbidden: FetchAdapter = async () => {
            throw new LightdashApiError(403, 'forbidden');
        };
        await expect(
            createApiSpaceChartsResolver(forbidden, 'proj-1')('sales'),
        ).resolves.toEqual({ space: null, charts: [] });

        const flaky: FetchAdapter = async () => {
            throw new LightdashApiError(500, 'boom');
        };
        await expect(
            createApiSpaceChartsResolver(flaky, 'proj-1')('sales'),
        ).rejects.toThrow(/boom/);
    });
});

describe('transport wiring', () => {
    it('is absent on a custom adapter without an explicit resolver', () => {
        const fetchFn: FetchAdapter = async <T>() => null as T;
        const transport = createApiTransport(
            { apiKey: '', baseUrl: '', projectUuid: 'proj-1' },
            fetchFn,
        );
        expect(transport.listSpaceCharts).toBeUndefined();
    });

    it('uses the resolver passed via options (postMessage wiring)', async () => {
        const fetchFn: FetchAdapter = async <T>() => null as T;
        const transport = createApiTransport(
            { apiKey: '', baseUrl: '', projectUuid: 'proj-1' },
            fetchFn,
            {
                resolveExploreBaseTable: null,
                listSpaceCharts: async () => ({ space: SPACE, charts: [] }),
            },
        );
        await expect(transport.listSpaceCharts?.('sales')).resolves.toEqual({
            space: SPACE,
            charts: [],
        });
    });
});
