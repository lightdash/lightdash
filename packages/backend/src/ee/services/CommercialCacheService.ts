import { FeatureFlags } from '@lightdash/common';
import { type S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type {
    CacheServiceUser,
    ICacheService,
} from '../../services/CacheService/ICacheService';
import { type CacheHitCacheResult } from '../../services/CacheService/types';

type CacheServiceDependencies = {
    queryHistoryModel: QueryHistoryModel;
    projectModel: ProjectModel;
    storageClient: S3ResultsFileStorageClient;
    featureFlagModel: FeatureFlagModel;
};

// Buffer time to ensure cache doesn't expire while being fetched
// This prevents queries from expiring during pagination requests
const DEFAULT_CACHE_EXPIRY_BUFFER_MS = 10 * 60 * 1000; // 10 minutes in milliseconds

export class CommercialCacheService implements ICacheService {
    private readonly queryHistoryModel: QueryHistoryModel;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    storageClient: S3ResultsFileStorageClient;

    constructor({
        queryHistoryModel,
        projectModel,
        storageClient,
        featureFlagModel,
    }: CacheServiceDependencies) {
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
    ): Promise<CacheHitCacheResult | null> {
        // Self-protect: gate every cache lookup on the FF, regardless of how
        // the caller arrived here. Belt-and-suspenders for embed and any
        // future caller that might forget the outer gate.
        if (!(await this.isResultsCacheEnabled(user))) {
            return null;
        }

        // Find recent query with matching cache key
        const [latestMatchingQuery, staleTimeSeconds] = await Promise.all([
            this.queryHistoryModel.findMostRecentByCacheKey(
                cacheKey,
                projectUuid,
            ),
            this.projectModel.getEffectiveResultsCacheTtlSeconds(projectUuid),
        ]);

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
