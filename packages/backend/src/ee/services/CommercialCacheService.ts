import { FeatureFlags, type QueryResultProducer } from '@lightdash/common';
import { type S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type {
    CacheServiceUser,
    ICacheService,
} from '../../services/CacheService/ICacheService';
import { type CacheHitCacheResult } from '../../services/CacheService/types';
import { isSameResultProducer } from '../../utils/queryResultProducer';

type CacheServiceDependencies = {
    lightdashConfig: LightdashConfig;
    queryHistoryModel: QueryHistoryModel;
    projectModel: ProjectModel;
    storageClient: S3ResultsFileStorageClient;
    featureFlagModel: FeatureFlagModel;
};

// Buffer time to ensure cache doesn't expire while being fetched
// This prevents queries from expiring during pagination requests
const DEFAULT_CACHE_EXPIRY_BUFFER_MS = 10 * 60 * 1000; // 10 minutes in milliseconds

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

    async isResultsCacheEnabled(
        user: CacheServiceUser | undefined,
    ): Promise<boolean> {
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.ResultsCacheEnabled,
        });
        return enabled;
    }

    async findCachedResultsFile(
        projectUuid: string,
        cacheKey: string,
        user: CacheServiceUser,
        requesterProducer: QueryResultProducer | null = null,
        resolvedIdentityEnabled: boolean | null = null,
    ): Promise<CacheHitCacheResult | null> {
        // Self-protect: gate every cache lookup on the FF, regardless of how
        // the caller arrived here. Belt-and-suspenders for embed and any
        // future caller that might forget the outer gate.
        if (!(await this.isResultsCacheEnabled(user))) {
            return null;
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
            return null;

        // Find recent query with matching cache key
        const [latestMatchingQuery, staleTimeSeconds] = await Promise.all([
            this.queryHistoryModel.findMostRecentByCacheKey(
                cacheKey,
                projectUuid,
                {
                    ...(identityEnabled ? { excludeAgentClaims: true } : {}),
                    excludeAgentProduced:
                        identityEnabled ||
                        this.lightdashConfig?.ai
                            ?.agentResultIdentityCheckEnabled !== false,
                },
            ),
            this.projectModel.getEffectiveResultsCacheTtlSeconds(projectUuid),
        ]);

        if (
            identityEnabled &&
            (!latestMatchingQuery?.resultProducer ||
                latestMatchingQuery.resultProducer.agentIdentity !== null ||
                !requesterProducer ||
                !isSameResultProducer(
                    latestMatchingQuery.resultProducer,
                    requesterProducer,
                ))
        )
            return null;

        const staleTimeMilliseconds = staleTimeSeconds * 1000;

        // If stale time is greater than quadruple default buffer, use default buffer
        // Otherwise, use quarter of stale time
        // This is to still allow any stale time to be used and keep a buffer for pagination requests
        const expiryBuffer =
            staleTimeMilliseconds > DEFAULT_CACHE_EXPIRY_BUFFER_MS * 4
                ? DEFAULT_CACHE_EXPIRY_BUFFER_MS
                : staleTimeMilliseconds / 4;

        const cacheExpiresAt = latestMatchingQuery?.resultsUpdatedAt
            ? new Date(
                  latestMatchingQuery.resultsUpdatedAt.getTime() +
                      staleTimeMilliseconds,
              )
            : null;

        // Availability can outlive cache freshness for retained results.
        if (
            latestMatchingQuery &&
            latestMatchingQuery.resultsFileName &&
            latestMatchingQuery.columns &&
            latestMatchingQuery.resultsCreatedAt &&
            latestMatchingQuery.resultsExpiresAt &&
            latestMatchingQuery.resultsUpdatedAt &&
            latestMatchingQuery.totalRowCount !== null &&
            cacheExpiresAt &&
            cacheExpiresAt > new Date(Date.now() + expiryBuffer) &&
            latestMatchingQuery.resultsExpiresAt >
                new Date(Date.now() + expiryBuffer)
        ) {
            return {
                cacheHit: true,
                queryUuid: latestMatchingQuery.queryUuid,
                queryHistory: latestMatchingQuery.queryHistory,
                resultProducer: latestMatchingQuery.resultProducer ?? null,
                cacheKey: latestMatchingQuery.cacheKey,
                fileName: latestMatchingQuery.resultsFileName,
                createdAt: latestMatchingQuery.resultsCreatedAt,
                updatedAt: latestMatchingQuery.resultsUpdatedAt,
                expiresAt: cacheExpiresAt,
                totalRowCount: latestMatchingQuery.totalRowCount,
                columns: latestMatchingQuery.columns,
                originalColumns: latestMatchingQuery.originalColumns,
                pivotValuesColumns: latestMatchingQuery.pivotValuesColumns,
                pivotTotalColumnCount:
                    latestMatchingQuery.pivotTotalColumnCount,
            };
        }

        return null;
    }
}
