import * as crypto from 'crypto';
import { Knex } from 'knex';
import type { LightdashConfig } from '../../config/parseConfig';
import {
    ResultsCacheTableName,
    type DbResultsCacheIn,
    type DbResultsCacheUpdate,
} from '../../database/entities/resultsFile';

export class ResultsFileModel {
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
        const CACHE_VERSION = 'v1'; // change when we want to force invalidation
        const queryHashKey = resultsIdentifiers.timezone
            ? `${CACHE_VERSION}.${projectUuid}.${resultsIdentifiers.sql}.${resultsIdentifiers.timezone}`
            : `${CACHE_VERSION}.${projectUuid}.${resultsIdentifiers.sql}`;

        return crypto.createHash('sha256').update(queryHashKey).digest('hex');
    }

    async create(data: DbResultsCacheIn) {
        const [createdCache] = await this.database(ResultsCacheTableName)
            .insert(data)
            .onConflict('cache_key') // upsert
            .merge()
            .returning([
                'cache_key',
                'created_at',
                'updated_at',
                'expires_at',
                'status',
            ]);

        return createdCache;
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
}
