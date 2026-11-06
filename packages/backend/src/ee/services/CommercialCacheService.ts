import {
    FeatureFlags,
    ResultsCacheMissReason,
    type QueryResultProducer,
} from '@lightdash/common';
import { type S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { getResultsCacheExpiryBufferMs } from '../../services/CacheService/expiryBuffer';
import type {
    CacheServiceUser,
    ICacheService,
} from '../../services/CacheService/ICacheService';
import {
    type CacheHitCacheResult,
    type CacheLookupMiss,
    type CacheLookupResult,
} from '../../services/CacheService/types';
import {
    isConnectionProducedQuery,
    isSameResultProducer,
} from '../../utils/queryResultProducer';

type CacheServiceDependencies = {
    lightdashConfig: LightdashConfig;
    queryHistoryModel: QueryHistoryModel;
    projectModel: ProjectModel;
    storageClient: S3ResultsFileStorageClient;
    featureFlagModel: FeatureFlagModel;
};

export class CommercialCacheService implements ICacheService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly queryHistoryModel: QueryHistoryModel;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    storageClient: S3ResultsFileStorageClient;

    constructor({
        lightdashConfig,
        queryHistoryModel,
        projectModel,
        storageClient,
        featureFlagModel,
    }: CacheServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.queryHistoryModel = queryHistoryModel;
        this.projectModel = projectModel;
        this.storageClient = storageClient;
        this.featureFlagModel = featureFlagModel;
    }

    async findCachedResultsFile(
        projectUuid: string,
        cacheKey: string,
        user: CacheServiceUser,
        requesterProducer: QueryResultProducer | null = null,
        resolvedIdentityEnabled: boolean | null = null,
    ): Promise<CacheHitCacheResult | null> {
        const result = await this.lookupCachedResultsFile(
            projectUuid,
            cacheKey,
            user,
            requesterProducer,
            resolvedIdentityEnabled,
        );
        return result.cacheHit ? result : null;
    }

    async lookupCachedResultsFile(
        projectUuid: string,
        cacheKey: string,
        user: CacheServiceUser,
        requesterProducer: QueryResultProducer | null = null,
        resolvedIdentityEnabled: boolean | null = null,
    ): Promise<CacheLookupResult> {
        const miss = (missReason: ResultsCacheMissReason): CacheLookupMiss => ({
            cacheHit: false,
            missReason,
        });
        // Self-protect: gate every lookup on the project setting, whatever the caller.
        const { enabled, ttlSeconds: staleTimeSeconds } =
            await this.projectModel.getResultsCacheState(projectUuid);
        if (!enabled) {
            return miss(ResultsCacheMissReason.CACHE_DISABLED);
        }

        const identityEnabled =
            resolvedIdentityEnabled ??
            (
                await this.featureFlagModel.get({
                    user,
                    featureFlagId: FeatureFlags.AgentIdentity,
                })
            ).enabled;
        if (
            identityEnabled &&
            (!requesterProducer || requesterProducer.agentIdentity !== null)
        )
            return miss(ResultsCacheMissReason.ACCESS_RESTRICTED);

        const latestMatchingQuery =
            await this.queryHistoryModel.findMostRecentByCacheKey(
                cacheKey,
                projectUuid,
                {
                    ...(identityEnabled
                        ? { excludeAgentClaims: true, excludeCacheHits: true }
                        : {}),
                    excludeAgentProduced:
                        identityEnabled ||
                        this.lightdashConfig?.ai
                            ?.agentResultIdentityCheckEnabled !== false,
                },
            );

        const staleTimeMilliseconds = staleTimeSeconds * 1000;
        const expiryBuffer = getResultsCacheExpiryBufferMs(
            staleTimeMilliseconds,
        );
        if (!latestMatchingQuery) {
            // Only results that would still be fresh count as cleared.
            const cleared =
                await this.queryHistoryModel.hasClearedResultsForCacheKey(
                    cacheKey,
                    projectUuid,
                    new Date(Date.now() + expiryBuffer - staleTimeMilliseconds),
                );
            return miss(
                cleared
                    ? ResultsCacheMissReason.CLEARED
                    : ResultsCacheMissReason.NO_CACHED_RESULT,
            );
        }

        if (
            identityEnabled &&
            (!latestMatchingQuery.resultProducer ||
                latestMatchingQuery.resultProducer.agentIdentity !== null ||
                !requesterProducer ||
                !isSameResultProducer(
                    latestMatchingQuery.resultProducer,
                    requesterProducer,
                ))
        )
            return miss(ResultsCacheMissReason.ACCESS_RESTRICTED);

        if (
            latestMatchingQuery.queryHistory &&
            isConnectionProducedQuery(latestMatchingQuery.queryHistory)
        )
            return miss(ResultsCacheMissReason.ACCESS_RESTRICTED);

        const {
            resultsFileName,
            columns,
            resultsCreatedAt,
            resultsExpiresAt,
            resultsUpdatedAt,
            totalRowCount,
        } = latestMatchingQuery;
        if (
            !resultsFileName ||
            !columns ||
            !resultsCreatedAt ||
            !resultsExpiresAt ||
            !resultsUpdatedAt ||
            totalRowCount === null
        )
            return miss(ResultsCacheMissReason.NO_CACHED_RESULT);

        const cacheExpiresAt = new Date(
            resultsUpdatedAt.getTime() + staleTimeMilliseconds,
        );
        const usableUntil = new Date(Date.now() + expiryBuffer);
        // Availability can outlive cache freshness for retained results.
        if (cacheExpiresAt <= usableUntil || resultsExpiresAt <= usableUntil)
            return miss(ResultsCacheMissReason.EXPIRED);

        return {
            cacheHit: true,
            queryUuid: latestMatchingQuery.queryUuid,
            queryHistory: latestMatchingQuery.queryHistory,
            resultProducer: latestMatchingQuery.resultProducer ?? null,
            cacheKey: latestMatchingQuery.cacheKey,
            cacheGeneration: latestMatchingQuery.cacheGeneration,
            fileName: resultsFileName,
            createdAt: resultsCreatedAt,
            updatedAt: resultsUpdatedAt,
            expiresAt: cacheExpiresAt,
            totalRowCount,
            columns,
            originalColumns: latestMatchingQuery.originalColumns,
            pivotValuesColumns: latestMatchingQuery.pivotValuesColumns,
            pivotTotalColumnCount: latestMatchingQuery.pivotTotalColumnCount,
        };
    }
}
