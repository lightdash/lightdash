import { DEFAULT_RESULTS_PAGE_SIZE, NotFoundError } from '@lightdash/common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import type { LightdashConfig } from '../../config/parseConfig';
import { ResultsCacheTableName } from '../../database/entities/resultsCache';
import { ResultsCacheStorageClient } from './ResultsCacheStorageClient';

export class ResultsCacheModel {
    readonly database: Knex;

    protected lightdashConfig: LightdashConfig;

    protected storageClient: ResultsCacheStorageClient;

    constructor({
        database,
        lightdashConfig,
        storageClient,
    }: {
        database: Knex;
        lightdashConfig: LightdashConfig;
        storageClient: ResultsCacheStorageClient;
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
        resultsStream: ReadableStream,
        cacheIdentifiers: {
            sql: string;
            timezone?: string;
        },
    ) {
        const cacheKey = ResultsCacheModel.getCacheKey(
            projectUuid,
            cacheIdentifiers,
        );

        const existingCache = await this.find(cacheKey, projectUuid);

        if (existingCache) {
            if (existingCache.cache_expires_at > new Date()) {
                return existingCache.cache_key;
            }

            await this.database(ResultsCacheTableName)
                .where('cache_key', existingCache.cache_key)
                .delete();
        }

        await this.storageClient.upload(
            cacheKey,
            resultsStream,
            DEFAULT_RESULTS_PAGE_SIZE,
        );

        return this.database(ResultsCacheTableName)
            .insert({
                cache_key: cacheKey,
                project_uuid: projectUuid,
                cache_expires_at: this.getCacheExpiresAt(),
            })
            .returning('cache_key');
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
