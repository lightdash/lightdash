import { CommercialCacheService } from './CommercialCacheService';

const makeService = (
    resultsUpdatedAt: Date,
    effectiveTtlSeconds: number = 24 * 60 * 60,
) => {
    const getEffectiveResultsCacheTtlSeconds = vi
        .fn()
        .mockResolvedValue(effectiveTtlSeconds);
    const service = new CommercialCacheService({
        queryHistoryModel: {
            findMostRecentByCacheKey: vi.fn().mockResolvedValue({
                cacheKey: 'cache-key',
                resultsFileName: 'results.jsonl',
                resultsCreatedAt: resultsUpdatedAt,
                resultsUpdatedAt,
                resultsExpiresAt: new Date('2026-09-01T00:00:00.000Z'),
                totalRowCount: 1,
                columns: { value: { type: 'number' } },
                originalColumns: null,
                pivotValuesColumns: null,
                pivotTotalColumnCount: null,
            }),
        } as never,
        projectModel: { getEffectiveResultsCacheTtlSeconds } as never,
        storageClient: {} as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
    });
    return { service, getEffectiveResultsCacheTtlSeconds };
};

describe('CommercialCacheService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not treat retained results as fresh after the cache window', async () => {
        const { service } = makeService(new Date('2026-07-30T11:00:00.000Z'));

        await expect(
            service.findCachedResultsFile('project-uuid', 'cache-key', {
                userUuid: 'user-uuid',
            }),
        ).resolves.toBeNull();
    });

    it('returns the logical cache expiry for fresh retained results', async () => {
        const { service } = makeService(new Date('2026-07-31T11:00:00.000Z'));

        await expect(
            service.findCachedResultsFile('project-uuid', 'cache-key', {
                userUuid: 'user-uuid',
            }),
        ).resolves.toMatchObject({
            cacheHit: true,
            expiresAt: new Date('2026-08-01T11:00:00.000Z'),
        });
    });

    it('resolves the TTL for the requested project', async () => {
        const { service, getEffectiveResultsCacheTtlSeconds } = makeService(
            new Date('2026-07-31T11:00:00.000Z'),
        );

        await service.findCachedResultsFile('project-uuid', 'cache-key', {
            userUuid: 'user-uuid',
        });

        expect(getEffectiveResultsCacheTtlSeconds).toHaveBeenCalledWith(
            'project-uuid',
        );
    });

    it('uses a shorter project TTL to expire results the instance default would keep', async () => {
        const thirtyMinutes = 30 * 60;
        const { service } = makeService(
            new Date('2026-07-31T11:00:00.000Z'),
            thirtyMinutes,
        );

        await expect(
            service.findCachedResultsFile('project-uuid', 'cache-key', {
                userUuid: 'user-uuid',
            }),
        ).resolves.toBeNull();
    });

    it('computes the expiry from a project TTL for fresh results', async () => {
        const twoHours = 2 * 60 * 60;
        const { service } = makeService(
            new Date('2026-07-31T11:00:00.000Z'),
            twoHours,
        );

        await expect(
            service.findCachedResultsFile('project-uuid', 'cache-key', {
                userUuid: 'user-uuid',
            }),
        ).resolves.toMatchObject({
            cacheHit: true,
            expiresAt: new Date('2026-07-31T13:00:00.000Z'),
        });
    });
});
