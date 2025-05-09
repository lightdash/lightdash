import { type S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import type { LightdashConfig } from '../../config/parseConfig';
import { ResultsFileModel } from '../../models/ResultsFileModel/ResultsFileModel';
import type { ICacheService } from '../../services/CacheService/ICacheService';
import { type CacheHitCacheResult } from '../../services/CacheService/types';

type CacheServiceDependencies = {
    resultsFileModel: ResultsFileModel;
    lightdashConfig: LightdashConfig;
    storageClient: S3ResultsFileStorageClient;
};

export class CommercialCacheService implements ICacheService {
    private readonly resultsFileModel: ResultsFileModel;

    private readonly lightdashConfig: LightdashConfig;

    storageClient: S3ResultsFileStorageClient;

    constructor({
        resultsFileModel,
        lightdashConfig,
        storageClient,
    }: CacheServiceDependencies) {
        this.resultsFileModel = resultsFileModel;
        this.lightdashConfig = lightdashConfig;
        this.storageClient = storageClient;
    }

    async findCachedResultsFile(
        projectUuid: string,
        cacheIdentifiers: {
            sql: string;
            timezone?: string;
        },
    ): Promise<CacheHitCacheResult | null> {
        // If caching is disabled, return null
        if (!this.lightdashConfig.results.cacheEnabled) {
            return null;
        }

        // Generate cache key from project and query identifiers
        const cacheKey = ResultsFileModel.getCacheKey(
            projectUuid,
            cacheIdentifiers,
        );

        // Check if cache already exists
        const existingCache = await this.resultsFileModel.find(
            cacheKey,
            projectUuid,
        );

        // Case 1: Valid cache exists
        if (existingCache && existingCache.expires_at > new Date()) {
            return {
                cacheKey: existingCache.cache_key,
                createdAt: existingCache.created_at,
                updatedAt: existingCache.updated_at,
                expiresAt: existingCache.expires_at,
                cacheHit: true,
                write: undefined,
                close: undefined,
                totalRowCount: existingCache.total_row_count ?? 0,
                status: existingCache.status,
            };
        }

        return null;
    }
}
