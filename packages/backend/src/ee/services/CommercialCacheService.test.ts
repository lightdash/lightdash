import {
    AgentActorSurface,
    buildAgentIdentityClaim,
    FeatureFlags,
    type QueryResultProducer,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CommercialCacheService } from './CommercialCacheService';

const makeService = (
    resultsUpdatedAt: Date,
    effectiveTtlSeconds: number = 24 * 60 * 60,
) => {
    const getEffectiveResultsCacheTtlSeconds = vi
        .fn()
        .mockResolvedValue(effectiveTtlSeconds);
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
    const getFlag = vi.fn(async ({ featureFlagId }) => ({
        enabled: featureFlagId === FeatureFlags.ResultsCacheEnabled,
    }));
    const config = {
        ...lightdashConfigMock,
        ai: { ...lightdashConfigMock.ai },
    };
    const service = new CommercialCacheService({
        lightdashConfig: config,
        queryHistoryModel: { findMostRecentByCacheKey } as never,
        projectModel: { getEffectiveResultsCacheTtlSeconds } as never,
        storageClient: {} as never,
        featureFlagModel: {
            get: getFlag,
        } as never,
    });
    return {
        service,
        getEffectiveResultsCacheTtlSeconds,
        candidate,
        findMostRecentByCacheKey,
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
            f.service.findCachedResultsFile(
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
                f.service.findCachedResultsFile(
                    'project',
                    'cache',
                    user,
                    sharedProducer,
                ),
            ).resolves.toBeNull();
            f.candidate.resultProducer = {
                ...sharedProducer,
                warehouseConnectionUuid: 'other',
            };
            await expect(
                f.service.findCachedResultsFile(
                    'project',
                    'cache',
                    user,
                    sharedProducer,
                ),
            ).resolves.toBeNull();
            f.candidate.resultProducer = {
                ...sharedProducer,
                credentialOwner: {
                    kind: 'person',
                    userUuid: 'other',
                    userWarehouseCredentialsUuid: 'credential',
                },
            };
            await expect(
                f.service.findCachedResultsFile(
                    'project',
                    'cache',
                    user,
                    sharedProducer,
                ),
            ).resolves.toBeNull();
            f.candidate.resultProducer = {
                ...sharedProducer,
                agentIdentity: buildAgentIdentityClaim({
                    subject: { type: 'user', uuid: 'reader' },
                    surface: AgentActorSurface.IN_APP_AGENT,
                    clientId: 'lightdash-chat',
                }),
            };
            await expect(
                f.service.findCachedResultsFile(
                    'project',
                    'cache',
                    user,
                    sharedProducer,
                ),
            ).resolves.toBeNull();
            f.candidate.resultProducer = { ...sharedProducer };
            const hit = await f.service.findCachedResultsFile(
                'project',
                'cache',
                user,
                sharedProducer,
            );
            expect(hit?.resultProducer).toBe(f.candidate.resultProducer);
            expect(hit?.cacheHit).toBe(true);
            expect(f.findMostRecentByCacheKey).toHaveBeenLastCalledWith(
                'cache',
                'project',
                { excludeAgentClaims: true, excludeAgentProduced: true },
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
            f.service.findCachedResultsFile(
                'project',
                'cache',
                { userUuid: 'reader' },
                { ...sharedProducer, agentIdentity },
            ),
        ).resolves.toBeNull();
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
            queryHistoryModel: { findMostRecentByCacheKey } as never,
            projectModel: {
                getEffectiveResultsCacheTtlSeconds: vi
                    .fn()
                    .mockResolvedValue(3600),
            } as never,
            storageClient: {} as never,
            featureFlagModel: {
                get: vi.fn(async ({ featureFlagId }) => ({
                    enabled: featureFlagId === FeatureFlags.ResultsCacheEnabled,
                })),
            } as never,
        });
        await service.findCachedResultsFile('project', 'cache', {
            userUuid: 'user',
        });
        expect(findMostRecentByCacheKey).toHaveBeenLastCalledWith(
            'cache',
            'project',
            { excludeAgentProduced: true },
        );
        lightdashConfig.ai.agentResultIdentityCheckEnabled = false;
        await service.findCachedResultsFile('project', 'cache', {
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
