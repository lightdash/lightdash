import {
    DEFAULT_RESULTS_PAGE_SIZE,
    ExpiredError,
    NotFoundError,
    ResultRow,
} from '@lightdash/common';
import { createInterface } from 'readline';
import type { LightdashConfig } from '../../config/parseConfig';
import type { ICacheService } from '../../services/CacheService/ICacheService';
import {
    ResultsCacheStatus,
    type CacheHitCacheResult,
    type CreateCacheResult,
} from '../../services/CacheService/types';
import type { IResultsCacheStorageClient } from '../clients/ResultsCacheStorageClients/IResultsCacheStorageClient';
import type { DbResultsCacheUpdate } from '../database/entities/resultsCache';
import { ResultsCacheModel } from '../models/ResultsCacheModel/ResultsCacheModel';

type CacheServiceDependencies = {
    resultsCacheModel: ResultsCacheModel;
    lightdashConfig: LightdashConfig;
    storageClient: IResultsCacheStorageClient;
};

export class CommercialCacheService
    implements ICacheService<IResultsCacheStorageClient>
{
    private readonly resultsCacheModel: ResultsCacheModel;

    private readonly lightdashConfig: LightdashConfig;

    storageClient: IResultsCacheStorageClient;

    constructor({
        resultsCacheModel,
        lightdashConfig,
        storageClient,
    }: CacheServiceDependencies) {
        this.resultsCacheModel = resultsCacheModel;
        this.lightdashConfig = lightdashConfig;
        this.storageClient = storageClient;
    }

    private getCacheExpiresAt(baseDate: Date) {
        return new Date(
            baseDate.getTime() +
                this.lightdashConfig.results.cacheStateTimeSeconds * 1000,
        );
    }

    async createOrGetExistingCache(
        projectUuid: string,
        cacheIdentifiers: {
            sql: string;
            timezone?: string;
        },
        invalidateCache: boolean = false,
    ): Promise<CreateCacheResult> {
        // Generate cache key from project and query identifiers
        const cacheKey = ResultsCacheModel.getCacheKey(
            projectUuid,
            cacheIdentifiers,
        );

        // Check if cache already exists
        const existingCache = await this.resultsCacheModel.find(
            cacheKey,
            projectUuid,
        );

        // Case 1: Valid cache exists and not being invalidated
        if (
            existingCache &&
            existingCache.expires_at > new Date() &&
            !invalidateCache
        ) {
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

        // Create upload stream for storing results
        const { write, close } = this.storageClient.createUploadStream(
            cacheKey,
            DEFAULT_RESULTS_PAGE_SIZE,
        );

        const now = new Date();
        const newExpiresAt = this.getCacheExpiresAt(now);

        // Case 2: Cache exists but is invalid or being invalidated
        if (existingCache) {
            // Update expiration time
            await this.resultsCacheModel.update(
                existingCache.cache_key,
                projectUuid,
                {
                    expires_at: newExpiresAt,
                    updated_at: now,
                    status: ResultsCacheStatus.PENDING,
                    total_row_count: null,
                },
            );

            return {
                cacheKey: existingCache.cache_key,
                createdAt: existingCache.created_at,
                updatedAt: now,
                expiresAt: newExpiresAt,
                cacheHit: false,
                write,
                close,
                totalRowCount: null,
            };
        }

        // Case 3: No cache exists - create new cache entry
        const createdCache = await this.resultsCacheModel.create({
            cache_key: cacheKey,
            project_uuid: projectUuid,
            expires_at: newExpiresAt,
            total_row_count: null,
            status: ResultsCacheStatus.PENDING,
        });

        if (!createdCache) {
            await close();
            throw new Error('Failed to create cache');
        }

        return {
            cacheKey: createdCache.cache_key,
            createdAt: createdCache.created_at,
            updatedAt: createdCache.updated_at,
            expiresAt: createdCache.expires_at,
            write,
            close,
            cacheHit: false,
            totalRowCount: null,
        };
    }

    async getCachedResultsPage(
        cacheKey: string,
        projectUuid: string,
        page: number,
        pageSize: number,
        formatter: (row: ResultRow) => ResultRow,
    ) {
        const cache = await this.resultsCacheModel.find(cacheKey, projectUuid);

        if (!cache) {
            // TODO: throw a specific error the FE will respond to
            throw new NotFoundError(
                `Cache not found for key ${cacheKey} and project ${projectUuid}`,
            );
        }

        if (cache.expires_at < new Date()) {
            await this.resultsCacheModel.delete(cacheKey, projectUuid);

            // TODO: throw a specific error the FE will respond to
            throw new ExpiredError(
                `Cache expired for key ${cacheKey} and project ${projectUuid}`,
            );
        }

        const cacheStream = await this.storageClient.getDowloadStream(cacheKey);

        const rows: ResultRow[] = [];
        const rl = createInterface({
            input: cacheStream,
            crlfDelay: Infinity,
        });

        const startLine = (page - 1) * pageSize;
        const endLine = startLine + pageSize;
        let nonEmptyLineCount = 0;

        for await (const line of rl) {
            if (line.trim()) {
                if (
                    nonEmptyLineCount >= startLine &&
                    nonEmptyLineCount < endLine
                ) {
                    rows.push(formatter(JSON.parse(line)));
                }
                nonEmptyLineCount += 1;
            }
        }

        return {
            rows,
            totalRowCount: cache.total_row_count ?? 0,
            expiresAt: cache.expires_at,
        };
    }

    async updateCache(
        cacheKey: string,
        projectUuid: string,
        update: DbResultsCacheUpdate,
    ) {
        await this.resultsCacheModel.update(cacheKey, projectUuid, update);
    }

    async deleteCache(cacheKey: string, projectUuid: string) {
        await this.resultsCacheModel.delete(cacheKey, projectUuid);
    }

    async findCache(
        cacheKey: string,
        projectUuid: string,
    ): Promise<CacheHitCacheResult | undefined> {
        const cache = await this.resultsCacheModel.find(cacheKey, projectUuid);

        if (cache) {
            return {
                cacheKey,
                createdAt: cache.created_at,
                updatedAt: cache.updated_at,
                expiresAt: cache.expires_at,
                cacheHit: true,
                write: undefined,
                close: undefined,
                totalRowCount: cache.total_row_count ?? 0,
                status: cache.status,
            };
        }

        return undefined;
    }
}
