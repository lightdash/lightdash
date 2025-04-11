import {
    DEFAULT_RESULTS_PAGE_SIZE,
    ExpiredError,
    NotFoundError,
    ResultRow,
} from '@lightdash/common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import { createInterface } from 'readline';
import { IResultsCacheStorageClient } from '../../clients/ResultsCacheStorageClients/ResultsCacheStorageClient';
import type { LightdashConfig } from '../../config/parseConfig';
import {
    ResultsCacheTableName,
    type DbResultsCacheUpdate,
} from '../../database/entities/resultsCache';
import type { CreateCacheResult } from './types';

export class ResultsCacheModel {
    readonly database: Knex;

    protected lightdashConfig: LightdashConfig;

    constructor({
        database,
        lightdashConfig,
    }: {
        database: Knex;
        lightdashConfig: LightdashConfig;
    }) {
        this.database = database;
        this.lightdashConfig = lightdashConfig;
    }

    static getCacheKey(
        projectUuid: string,
        resultsIdentifiers: {
            sql: string;
            timezone?: string;
        },
    ) {
        const queryHashKey = resultsIdentifiers.timezone
            ? `${projectUuid}.${resultsIdentifiers.sql}.${resultsIdentifiers.timezone}`
            : `${projectUuid}.${resultsIdentifiers.sql}`;

        return crypto.createHash('sha256').update(queryHashKey).digest('hex');
    }

    private getCacheUpdatedAt(baseDate: Date) {
        return new Date(
            baseDate.getTime() +
                this.lightdashConfig.resultsCache.cacheStateTimeSeconds * 1000,
        );
    }

    async createOrGetExistingCache(
        projectUuid: string,
        cacheIdentifiers: {
            sql: string;
            timezone?: string;
        },
        storageClient: IResultsCacheStorageClient,
        invalidateCache: boolean = false,
    ): Promise<CreateCacheResult> {
        // Generate cache key from project and query identifiers
        const cacheKey = ResultsCacheModel.getCacheKey(
            projectUuid,
            cacheIdentifiers,
        );

        // Check if cache already exists
        const existingCache = await this.find(cacheKey, projectUuid);

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
                cacheHit: true,
                write: undefined,
                close: undefined,
                totalRowCount: existingCache.total_row_count ?? 0, // TODO cache: db types need to match the union
            };
        }

        // Create upload stream for storing results
        const { write, close } = storageClient.createUploadStream(
            cacheKey,
            DEFAULT_RESULTS_PAGE_SIZE,
        );

        const now = new Date();
        const newExpiresAt = this.getCacheUpdatedAt(now);

        // Case 2: Cache exists but is invalid or being invalidated
        if (existingCache) {
            // Update expiration time
            await this.update(existingCache.cache_key, projectUuid, {
                expires_at: newExpiresAt,
                updated_at: now,
            });

            return {
                cacheKey: existingCache.cache_key,
                createdAt: existingCache.created_at,
                updatedAt: now,
                cacheHit: false,
                write,
                close,
                totalRowCount: null,
            };
        }

        // Case 3: No cache exists - create new cache entry
        const [createdCache] = await this.database(ResultsCacheTableName)
            .insert({
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: newExpiresAt,
                total_row_count: null,
            })
            .returning(['cache_key', 'created_at', 'updated_at']);

        if (!createdCache) {
            await close();
            throw new Error('Failed to create cache');
        }

        return {
            cacheKey: createdCache.cache_key,
            createdAt: createdCache.created_at,
            updatedAt: createdCache.updated_at,
            write,
            close,
            cacheHit: false,
            totalRowCount: null,
        };
    }

    async update(
        cacheKey: string,
        projectUuid: string,
        update: DbResultsCacheUpdate,
    ) {
        return this.database(ResultsCacheTableName)
            .where('cache_key', cacheKey)
            .andWhere('project_uuid', projectUuid)
            .update(update);
    }

    async find(cacheKey: string, projectUuid: string) {
        return this.database(ResultsCacheTableName)
            .where('cache_key', cacheKey)
            .andWhere('project_uuid', projectUuid)
            .first();
    }

    async delete(cacheKey: string, projectUuid: string) {
        return this.database(ResultsCacheTableName)
            .where('cache_key', cacheKey)
            .andWhere('project_uuid', projectUuid)
            .delete();
    }

    async getCachedResultsPage(
        cacheKey: string,
        projectUuid: string,
        page: number,
        pageSize: number,
        storageClient: IResultsCacheStorageClient,
        formatter: (row: ResultRow) => ResultRow,
    ) {
        const cache = await this.find(cacheKey, projectUuid);

        if (!cache) {
            // TODO: throw a specific error the FE will respond to
            throw new NotFoundError(
                `Cache not found for key ${cacheKey} and project ${projectUuid}`,
            );
        }

        if (cache.expires_at < new Date()) {
            await this.delete(cacheKey, projectUuid);

            // TODO: throw a specific error the FE will respond to
            throw new ExpiredError(
                `Cache expired for key ${cacheKey} and project ${projectUuid}`,
            );
        }

        const cacheStream = await storageClient.getDowloadStream(cacheKey);

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
        };
    }
}
