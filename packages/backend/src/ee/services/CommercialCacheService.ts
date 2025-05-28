import { type S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import type { LightdashConfig } from '../../config/parseConfig';
import { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type { ICacheService } from '../../services/CacheService/ICacheService';
import { type CacheHitCacheResult } from '../../services/CacheService/types';

type CacheServiceDependencies = {
    queryHistoryModel: QueryHistoryModel;
    lightdashConfig: LightdashConfig;
    storageClient: S3ResultsFileStorageClient;
};

export class CommercialCacheService implements ICacheService {
    private readonly queryHistoryModel: QueryHistoryModel;

    private readonly lightdashConfig: LightdashConfig;

    storageClient: S3ResultsFileStorageClient;

    constructor({
        queryHistoryModel,
        lightdashConfig,
        storageClient,
    }: CacheServiceDependencies) {
        this.queryHistoryModel = queryHistoryModel;
        this.lightdashConfig = lightdashConfig;
        this.storageClient = storageClient;
    }

    async findCachedResultsFile(
        projectUuid: string,
        cacheKey: string,
    ): Promise<CacheHitCacheResult | null> {
        // If caching is disabled, return null
        if (!this.lightdashConfig.results.cacheEnabled) {
            return null;
        }

        // Find recent query with matching cache key
        const latestMatchingQuery =
            await this.queryHistoryModel.findMostRecentByCacheKey(
                cacheKey,
                projectUuid,
            );

        // Case 1: Valid cache exists
        if (
            latestMatchingQuery &&
            latestMatchingQuery.resultsFileName &&
            latestMatchingQuery.columns &&
            latestMatchingQuery.resultsCreatedAt &&
            latestMatchingQuery.resultsExpiresAt &&
            latestMatchingQuery.resultsUpdatedAt &&
            latestMatchingQuery.totalRowCount !== null &&
            latestMatchingQuery.resultsExpiresAt > new Date()
        ) {
            return {
                cacheHit: true,
                cacheKey: latestMatchingQuery.cacheKey,
                fileName: latestMatchingQuery.resultsFileName,
                createdAt: latestMatchingQuery.resultsCreatedAt,
                updatedAt: latestMatchingQuery.resultsUpdatedAt,
                expiresAt: latestMatchingQuery.resultsExpiresAt,
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
