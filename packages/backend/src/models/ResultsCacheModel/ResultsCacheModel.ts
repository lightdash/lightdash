import {
    DEFAULT_RESULTS_PAGE_SIZE,
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
        storageClient: IResultsCacheStorageClient,
    ): Promise<CreateCacheResult> {
        const cacheKey = ResultsCacheModel.getCacheKey(
            projectUuid,
            cacheIdentifiers,
        );

        const existingCache = await this.find(cacheKey, projectUuid);

        if (existingCache) {
            if (existingCache.expires_at > new Date()) {
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

        const { write, close } = storageClient.createUploadStream(
            cacheKey,
            DEFAULT_RESULTS_PAGE_SIZE,
        );

        const [createdCache] = await this.database(ResultsCacheTableName)
            .insert({
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: this.getCacheExpiresAt(),
                total_row_count: null,
            })
            .returning('cache_key');

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

        const cacheStream = await storageClient.download(
            cacheKey,
            page,
            pageSize,
        );

        if (!cacheStream) {
            throw new Error('No cache found');
        }

        const rows = [];
        const rl = createInterface({
            input: cacheStream,
            crlfDelay: Infinity,
        });

        const startLine = (page - 1) * pageSize;
        const endLine = startLine + pageSize;
        let currentLine = 0;

        for await (const line of rl) {
            if (currentLine >= startLine && currentLine < endLine) {
                if (line.trim()) {
                    rows.push(formatter(JSON.parse(line)));
                }
            } else if (currentLine >= endLine) {
                break;
            }
            currentLine += 1;
        }

        return rows as ResultRow[];
    }
}
