import {
    AgentActorSurface,
    buildAgentIdentityClaim,
    FeatureFlags,
    ResultsCacheMissReason,
    type QueryResultProducer,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CommercialCacheService } from './CommercialCacheService';

const makeService = (
    resultsUpdatedAt: Date,
    effectiveTtlSeconds: number = 24 * 60 * 60,
    cacheEnabled: boolean = true,
) => {
    const getResultsCacheState = vi.fn().mockResolvedValue({
        enabled: cacheEnabled,
        cacheGeneration: 0,
        ttlSeconds: effectiveTtlSeconds,
    });
    const candidate = {
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
        resultProducer: null as QueryResultProducer | null,
    };
    const findMostRecentByCacheKey = vi.fn(async () => candidate);
    const hasClearedResultsForCacheKey = vi.fn(async () => false);
    const getFlag = vi.fn(async (_args: { featureFlagId: string }) => ({
        enabled: false,
    }));
    const config = {
        ...lightdashConfigMock,
        ai: { ...lightdashConfigMock.ai },
    };
    const service = new CommercialCacheService({
        lightdashConfig: config,
        queryHistoryModel: {
            findMostRecentByCacheKey,
            hasClearedResultsForCacheKey,
        } as never,
        projectModel: { getResultsCacheState } as never,
        storageClient: {} as never,
        featureFlagModel: {
            get: getFlag,
        } as never,
    });
    return {
        service,
        getResultsCacheState,
        candidate,
        findMostRecentByCacheKey,
        hasClearedResultsForCacheKey,
        getFlag,
        config,
    };
};

describe('CommercialCacheService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('a resolved flag-off cache lookup does not resolve identity again', async () => {
        const f = makeService(new Date('2026-07-31T11:00:00.000Z'));
        await expect(
            f.service.lookupCachedResultsFile(
                'project',
                'cache',
                { userUuid: 'reader' },
                null,
                false,
            ),
        ).resolves.toMatchObject({ cacheHit: true });
        expect(
            f.getFlag.mock.calls.filter(
                ([args]) => args.featureFlagId === FeatureFlags.AgentIdentity,
            ),
        ).toHaveLength(0);
    });

    test.each(['claim', 'producer', 'envelope'] as const)(
        'refuses a connection cache candidate from its %s with identity off',
        async (marker) => {
            const f = makeService(new Date('2026-07-31T11:00:00.000Z'));
            f.config.ai.agentResultIdentityCheckEnabled = false;
            const claim = buildAgentIdentityClaim({
                subject: { type: 'user', uuid: 'reader' },
                surface: AgentActorSurface.CLI,
                clientId: 'lightdash-cli',
                agentConnectionGrant: { grantUuid: 'grant', revision: 1 },
            });
            Object.assign(f.candidate, {
                queryHistory: {
                    agentIdentity: marker === 'claim' ? claim : null,
                    requestParameters: {
                        ...(marker === 'producer'
                            ? { resultProducer: { agentIdentity: claim } }
                            : {}),
                        ...(marker === 'envelope'
                            ? {
                                  agentConnectionExecution: {
                                      grantUuid: 'grant',
                                  },
                              }
                            : {}),
                    },
                },
            });
            await expect(
                f.service.lookupCachedResultsFile(
                    'project',
                    'cache',
                    { userUuid: 'reader' },
                    null,
                    false,
                ),
            ).resolves.toMatchObject({ cacheHit: false });
        },
    );

    const sharedProducer: QueryResultProducer = {
        entitlementFingerprint: 'entitlement',
        version: 1,
        warehouseConnectionUuid: 'connection',
        credentialOwner: {
            kind: 'shared_connection',
            identityFingerprint: 'identity',
        },
        agentIdentity: null,
    };
    test.each([true, false])(
        'isolates cache with identity checks enabled=%s',
        async (checksEnabled) => {
            const f = makeService(new Date('2026-07-31T11:00:00.000Z'));
            f.getFlag.mockResolvedValue({ enabled: true });
            f.config.ai.agentResultIdentityCheckEnabled = checksEnabled;
            const user = { userUuid: 'reader' };
            await expect(
                f.service.lookupCachedResultsFile(
                    'project',
                    'cache',
                    user,
                    sharedProducer,
                ),
            ).resolves.toMatchObject({ cacheHit: false });
            f.candidate.resultProducer = {
                ...sharedProducer,
                warehouseConnectionUuid: 'other',
            };
            await expect(
                f.service.lookupCachedResultsFile(
                    'project',
                    'cache',
                    user,
                    sharedProducer,
                ),
            ).resolves.toMatchObject({ cacheHit: false });
            f.candidate.resultProducer = {
                ...sharedProducer,
                credentialOwner: {
                    kind: 'person',
                    userUuid: 'other',
                    userWarehouseCredentialsUuid: 'credential',
                },
            };
            await expect(
                f.service.lookupCachedResultsFile(
                    'project',
                    'cache',
                    user,
                    sharedProducer,
                ),
            ).resolves.toMatchObject({ cacheHit: false });
            f.candidate.resultProducer = {
                ...sharedProducer,
                agentIdentity: buildAgentIdentityClaim({
                    subject: { type: 'user', uuid: 'reader' },
                    surface: AgentActorSurface.IN_APP_AGENT,
                    clientId: 'lightdash-chat',
                }),
            };
            await expect(
                f.service.lookupCachedResultsFile(
                    'project',
                    'cache',
                    user,
                    sharedProducer,
                ),
            ).resolves.toMatchObject({ cacheHit: false });
            f.candidate.resultProducer = { ...sharedProducer };
            const hit = await f.service.lookupCachedResultsFile(
                'project',
                'cache',
                user,
                sharedProducer,
            );
            expect(hit).toMatchObject({ cacheHit: true });
            expect(hit.cacheHit && hit.resultProducer).toBe(
                f.candidate.resultProducer,
            );
            expect(f.findMostRecentByCacheKey).toHaveBeenLastCalledWith(
                'cache',
                'project',
                {
                    excludeAgentClaims: true,
                    excludeAgentProduced: true,
                    excludeCacheHits: true,
                },
            );
        },
    );

    test('all agent claims bypass the cache, including marked people', async () => {
        const f = makeService(new Date('2026-07-31T11:00:00.000Z'));
        f.getFlag.mockResolvedValue({ enabled: true });
        const agentIdentity = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'reader' },
            surface: AgentActorSurface.IN_APP_AGENT,
            clientId: 'lightdash-chat',
        });
        await expect(
            f.service.lookupCachedResultsFile(
                'project',
                'cache',
                { userUuid: 'reader' },
                { ...sharedProducer, agentIdentity },
            ),
        ).resolves.toMatchObject({ cacheHit: false });
        expect(f.findMostRecentByCacheKey).not.toHaveBeenCalled();
    });

    it('reads agent result exclusion config at lookup time', async () => {
        const lightdashConfig = {
            ...lightdashConfigMock,
            ai: {
                ...lightdashConfigMock.ai,
                agentResultIdentityCheckEnabled: true,
            },
        };
        const findMostRecentByCacheKey = vi.fn().mockResolvedValue(undefined);
        const service = new CommercialCacheService({
            lightdashConfig,
            queryHistoryModel: {
                findMostRecentByCacheKey,
                hasClearedResultsForCacheKey: vi.fn(async () => false),
            } as never,
            projectModel: {
                getResultsCacheState: vi.fn().mockResolvedValue({
                    enabled: true,
                    cacheGeneration: 0,
                    ttlSeconds: 3600,
                }),
            } as never,
            storageClient: {} as never,
            featureFlagModel: {
                get: vi.fn(async () => ({ enabled: false })),
            } as never,
        });
        await service.lookupCachedResultsFile('project', 'cache', {
            userUuid: 'user',
        });
        expect(findMostRecentByCacheKey).toHaveBeenLastCalledWith(
            'cache',
            'project',
            { excludeAgentProduced: true },
        );
        lightdashConfig.ai.agentResultIdentityCheckEnabled = false;
        await service.lookupCachedResultsFile('project', 'cache', {
            userUuid: 'user',
        });
        expect(findMostRecentByCacheKey).toHaveBeenLastCalledWith(
            'cache',
            'project',
            { excludeAgentProduced: false },
        );
        expect(findMostRecentByCacheKey).toHaveBeenCalledTimes(2);
    });

    it('does not treat retained results as fresh after the cache window', async () => {
        const { service } = makeService(new Date('2026-07-30T11:00:00.000Z'));

        await expect(
            service.lookupCachedResultsFile('project-uuid', 'cache-key', {
                userUuid: 'user-uuid',
            }),
        ).resolves.toMatchObject({ cacheHit: false });
    });

    it('returns the logical cache expiry for fresh retained results', async () => {
        const { service } = makeService(new Date('2026-07-31T11:00:00.000Z'));

        await expect(
            service.lookupCachedResultsFile('project-uuid', 'cache-key', {
                userUuid: 'user-uuid',
            }),
        ).resolves.toMatchObject({
            cacheHit: true,
            expiresAt: new Date('2026-08-01T11:00:00.000Z'),
        });
    });

    it('resolves the TTL for the requested project', async () => {
        const { service, getResultsCacheState } = makeService(
            new Date('2026-07-31T11:00:00.000Z'),
        );

        await service.lookupCachedResultsFile('project-uuid', 'cache-key', {
            userUuid: 'user-uuid',
        });

        expect(getResultsCacheState).toHaveBeenCalledWith('project-uuid');
    });

    it('uses a shorter project TTL to expire results the instance default would keep', async () => {
        const thirtyMinutes = 30 * 60;
        const { service } = makeService(
            new Date('2026-07-31T11:00:00.000Z'),
            thirtyMinutes,
        );

        await expect(
            service.lookupCachedResultsFile('project-uuid', 'cache-key', {
                userUuid: 'user-uuid',
            }),
        ).resolves.toMatchObject({ cacheHit: false });
    });

    it('computes the expiry from a project TTL for fresh results', async () => {
        const twoHours = 2 * 60 * 60;
        const { service } = makeService(
            new Date('2026-07-31T11:00:00.000Z'),
            twoHours,
        );

        await expect(
            service.lookupCachedResultsFile('project-uuid', 'cache-key', {
                userUuid: 'user-uuid',
            }),
        ).resolves.toMatchObject({
            cacheHit: true,
            expiresAt: new Date('2026-07-31T13:00:00.000Z'),
        });
    });

    describe('project results cache setting', () => {
        const freshResults = new Date('2026-07-31T11:00:00.000Z');
        const lookup = (service: CommercialCacheService) =>
            service.lookupCachedResultsFile('project', 'cache', {
                userUuid: 'reader',
            });

        it('skips the cache when results caching is off', async () => {
            const f = makeService(freshResults, undefined, false);
            await expect(lookup(f.service)).resolves.toMatchObject({
                cacheHit: false,
            });
            expect(f.findMostRecentByCacheKey).not.toHaveBeenCalled();
        });

        it('serves cached results when results caching is on', async () => {
            const f = makeService(freshResults, undefined, true);
            await expect(lookup(f.service)).resolves.toMatchObject({
                cacheHit: true,
            });
        });
    });

    describe('lookupCachedResultsFile miss reasons', () => {
        const user = {
            userUuid: 'user',
            organizationUuid: 'org',
            organizationName: 'Org',
        };

        test('reports cache_disabled when results caching is off', async () => {
            const f = makeService(
                new Date('2026-07-31T11:00:00.000Z'),
                undefined,
                false,
            );
            await expect(
                f.service.lookupCachedResultsFile('project', 'cache-key', user),
            ).resolves.toEqual({
                cacheHit: false,
                missReason: ResultsCacheMissReason.CACHE_DISABLED,
            });
        });

        test('reports no_cached_result when nothing matches and nothing was cleared', async () => {
            const f = makeService(new Date('2026-07-31T11:00:00.000Z'));
            f.findMostRecentByCacheKey.mockResolvedValue(undefined as never);
            await expect(
                f.service.lookupCachedResultsFile('project', 'cache-key', user),
            ).resolves.toEqual({
                cacheHit: false,
                missReason: ResultsCacheMissReason.NO_CACHED_RESULT,
            });
        });

        test('reports cleared when only invalidated rows exist', async () => {
            const f = makeService(new Date('2026-07-31T11:00:00.000Z'));
            f.findMostRecentByCacheKey.mockResolvedValue(undefined as never);
            f.hasClearedResultsForCacheKey.mockResolvedValue(true);
            await expect(
                f.service.lookupCachedResultsFile('project', 'cache-key', user),
            ).resolves.toEqual({
                cacheHit: false,
                missReason: ResultsCacheMissReason.CLEARED,
            });
            expect(f.hasClearedResultsForCacheKey).toHaveBeenCalledWith(
                'cache-key',
                'project',
                expect.any(Date),
            );
        });

        test('only counts clears of results that would still be fresh', async () => {
            const f = makeService(
                new Date('2026-07-31T11:00:00.000Z'),
                60 * 60,
            );
            f.findMostRecentByCacheKey.mockResolvedValue(undefined as never);
            await f.service.lookupCachedResultsFile(
                'project',
                'cache-key',
                user,
            );
            // 1h TTL with a 10 minute buffer: fresh results were updated after 11:10.
            expect(f.hasClearedResultsForCacheKey).toHaveBeenCalledWith(
                'cache-key',
                'project',
                new Date('2026-07-31T11:10:00.000Z'),
            );
        });

        test('reports expired when the newest result is older than the TTL', async () => {
            const f = makeService(new Date('2026-07-29T11:00:00.000Z'));
            await expect(
                f.service.lookupCachedResultsFile('project', 'cache-key', user),
            ).resolves.toEqual({
                cacheHit: false,
                missReason: ResultsCacheMissReason.EXPIRED,
            });
        });

        test('reports no_cached_result when the newest run has no results yet', async () => {
            const f = makeService(new Date('2026-07-31T11:00:00.000Z'));
            f.findMostRecentByCacheKey.mockResolvedValue({
                ...f.candidate,
                resultsFileName: null,
            } as never);
            await expect(
                f.service.lookupCachedResultsFile('project', 'cache-key', user),
            ).resolves.toEqual({
                cacheHit: false,
                missReason: ResultsCacheMissReason.NO_CACHED_RESULT,
            });
        });

        test('reports access_restricted when identity requires a producer', async () => {
            const f = makeService(new Date('2026-07-31T11:00:00.000Z'));
            await expect(
                f.service.lookupCachedResultsFile(
                    'project',
                    'cache-key',
                    user,
                    null,
                    true,
                ),
            ).resolves.toEqual({
                cacheHit: false,
                missReason: ResultsCacheMissReason.ACCESS_RESTRICTED,
            });
        });

        test('returns the hit for a fresh result', async () => {
            const f = makeService(new Date('2026-07-31T11:00:00.000Z'));
            await expect(
                f.service.lookupCachedResultsFile('project', 'cache-key', user),
            ).resolves.toMatchObject({
                cacheHit: true,
                fileName: 'results.jsonl',
            });
        });
    });
});
