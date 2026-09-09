import { resolveGcsAnalyticsSource } from './GcsAnalyticsSource';

describe('GCS analytics manifests', () => {
    const organizationUuid = '00000000-0000-0000-0000-000000000001';
    const prefix = `events/compacted/org_id=${organizationUuid}/`;
    const config = {
        bucket: 'example-bucket',
        organizationUuid,
        startDate: '2026-09-07',
        endDate: '2026-09-07',
        getAccessToken: async () => 'token',
    };
    const object = (date: string, stream = 'query_events') => ({
        name: `${prefix}stream=${stream}/dt=${date}/part.parquet`,
    });
    afterEach(() => vi.unstubAllGlobals());

    it('lists only the org prefix, handles pagination and bounds dates and streams', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [object('2026-09-06'), object('2026-09-07')],
                    nextPageToken: 'page2',
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [
                        object('2026-09-07', 'ai_usage'),
                        object('2026-09-08'),
                        object('2026-09-07', 'unknown'),
                    ],
                }),
            });
        vi.stubGlobal('fetch', fetchMock);
        const result = await resolveGcsAnalyticsSource(config);
        expect(fetchMock.mock.calls[0][0].searchParams.get('prefix')).toBe(
            prefix,
        );
        expect(fetchMock.mock.calls[1][0].searchParams.get('pageToken')).toBe(
            'page2',
        );
        expect(result.tables.map(({ name }) => name)).toEqual([
            'query_events',
            'ai_usage',
        ]);
        expect(result.tables.flatMap(({ urls }) => urls)).toHaveLength(2);
    });

    it('rejects cross-org list responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [
                        {
                            name: 'events/compacted/org_id=other/part.parquet',
                        },
                    ],
                }),
            }),
        );
        await expect(resolveGcsAnalyticsSource(config)).rejects.toThrow(
            /cross-org/,
        );
    });

    it('reports empty data without creating a misleading empty project', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
        );
        await expect(resolveGcsAnalyticsSource(config)).rejects.toThrow(
            /No compacted/,
        );
    });

    it('does not disclose credential-bearing HTTP error bodies', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                text: async () => 'token',
            }),
        );
        await expect(resolveGcsAnalyticsSource(config)).rejects.toThrow(
            'Analytics object listing failed (HTTP 403)',
        );
    });

    it('rejects org path injection before authenticating', async () => {
        const getAccessToken = vi.fn();
        await expect(
            resolveGcsAnalyticsSource({
                ...config,
                organizationUuid: '../other',
                getAccessToken,
            }),
        ).rejects.toThrow(/Invalid analytics/);
        expect(getAccessToken).not.toHaveBeenCalled();
    });
});
