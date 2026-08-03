import { type LightdashConfig } from '../../config/parseConfig';
import { CommercialCacheService } from './CommercialCacheService';

const makeService = (resultsUpdatedAt: Date) =>
    new CommercialCacheService({
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
        lightdashConfig: {
            results: { cacheStateTimeSeconds: 24 * 60 * 60 },
        } as LightdashConfig,
        storageClient: {} as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
    });

describe('CommercialCacheService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not treat retained results as fresh after the cache window', async () => {
        const service = makeService(new Date('2026-07-30T11:00:00.000Z'));

        await expect(
            service.findCachedResultsFile('project-uuid', 'cache-key', {
                userUuid: 'user-uuid',
            }),
        ).resolves.toBeNull();
    });

    it('returns the logical cache expiry for fresh retained results', async () => {
        const service = makeService(new Date('2026-07-31T11:00:00.000Z'));

        await expect(
            service.findCachedResultsFile('project-uuid', 'cache-key', {
                userUuid: 'user-uuid',
            }),
        ).resolves.toMatchObject({
            cacheHit: true,
            expiresAt: new Date('2026-08-01T11:00:00.000Z'),
        });
    });
});
