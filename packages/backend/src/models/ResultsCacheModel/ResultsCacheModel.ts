import { DEFAULT_RESULTS_PAGE_SIZE, NotFoundError } from '@lightdash/common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
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

    protected storageClient: IResultsCacheStorageClient;

    constructor({
        database,
        lightdashConfig,
        storageClient,
    }: {
        database: Knex;
        lightdashConfig: LightdashConfig;
        storageClient: IResultsCacheStorageClient;
    }) {
        this.database = database;
        this.lightdashConfig = lightdashConfig;
        this.storageClient = storageClient;
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

    private getCacheExpiresAt() {
        return new Date(
            Date.now() +
                this.lightdashConfig.resultsCache.cacheStateTimeSeconds * 1000,
        );
    }

    async create(
        projectUuid: string,
        cacheIdentifiers: {
            sql: string;
            timezone?: string;
        },
    ): Promise<CreateCacheResult> {
        const cacheKey = ResultsCacheModel.getCacheKey(
            projectUuid,
            cacheIdentifiers,
        );

        const existingCache = await this.find(cacheKey, projectUuid);

        if (existingCache) {
            if (existingCache.cache_expires_at > new Date()) {
                return {
                    cacheKey: existingCache.cache_key,
                    cacheHit: true,
                    write: undefined,
                    close: undefined,
                    totalRowCount: existingCache.total_row_count ?? 0, // TODO cache: db types need to match the union
                };
            }

            await this.database(ResultsCacheTableName)
                .where('cache_key', existingCache.cache_key)
                .delete();
        }

        const { write, close } = this.storageClient.createUploadStream(
            cacheKey,
            DEFAULT_RESULTS_PAGE_SIZE,
        );

        const createdCache = await this.database(ResultsCacheTableName)
            .insert({
                cache_key: cacheKey,
                project_uuid: projectUuid,
                cache_expires_at: this.getCacheExpiresAt(),
                total_row_count: null,
            })
            .returning('cache_key')
            .first();

        if (!createdCache) {
            await close();
            throw new Error('Failed to create cache');
        }

        return {
            cacheKey: createdCache.cache_key,
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

    async getCachedResults(
        cacheKey: string,
        projectUuid: string,
        page: number,
        pageSize: number,
    ) {
        const cache = await this.find(cacheKey, projectUuid);

        if (!cache) {
            throw new NotFoundError(
                `Cache not found for key ${cacheKey} and project ${projectUuid}`,
            );
        }

        return this.storageClient.download(cacheKey, page, pageSize);
    }
}
