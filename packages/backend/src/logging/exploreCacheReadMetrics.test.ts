import {
    SupportedDbtAdapter,
    type CompiledTable,
    type Explore,
} from '@lightdash/common';
import { type Knex } from 'knex';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    attachExploreCacheStatementMetrics,
    isCachedExploreStatement,
    safeGetCachedExploreStorageBytes,
    summarizeCatalogSearchExploreRead,
} from './exploreCacheReadMetrics';

const explore = (name: string, tableNames: string[]): Explore => {
    const tables = Object.fromEntries(
        tableNames.map((tableName) => [
            tableName,
            {
                name: tableName,
                label: tableName,
                database: 'database',
                schema: 'schema',
                sqlTable: tableName,
                dimensions: {},
                metrics: {},
                lineageGraph: {},
            } satisfies CompiledTable,
        ]),
    );

    return {
        name,
        label: name,
        tags: [],
        tables,
        baseTable: tableNames[0],
        joinedTables: tableNames.slice(1).map((table) => ({
            table,
            sqlOn: '',
            compiledSqlOn: '',
        })),
        targetDatabase: SupportedDbtAdapter.POSTGRES,
    };
};

describe('safeGetCachedExploreStorageBytes', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('does not run the storage query when disabled', async () => {
        vi.stubEnv('LIGHTDASH_EXPLORE_CACHE_READ_STORAGE_BYTES', 'false');
        const getStorageBytes = vi.fn(async () => 42);

        await expect(
            safeGetCachedExploreStorageBytes(getStorageBytes),
        ).resolves.toBeUndefined();

        expect(getStorageBytes).not.toHaveBeenCalled();
    });
});

describe('isCachedExploreStatement', () => {
    it.each([
        'select * from "cached_explore"',
        'select * from "public"."cached_explore" as "cache"',
        'with cache as (select * from cached_explore) select * from cache',
        'update cached_explore set name = ?',
        'delete from cached_explore where project_uuid = ?',
        'insert into cached_explore (name) values (?)',
    ])('matches %s', (sql) => {
        expect(isCachedExploreStatement(sql)).toBe(true);
    });

    it.each([
        'select * from projects',
        'select * from cached_explore_versions',
        'select * from archived_cached_explore',
        undefined,
    ])('does not match %s', (sql) => {
        expect(isCachedExploreStatement(sql)).toBe(false);
    });
});

describe('attachExploreCacheStatementMetrics', () => {
    afterEach(() => {
        getTracker().reset();
        vi.unstubAllEnvs();
    });

    it('emits a distinct automatic record for a cached explore statement', async () => {
        const database = knex({ client: MockClient, dialect: 'pg' });
        const log = vi.fn();
        const now = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(13.5);
        getTracker()
            .on.select('cached_explore')
            .responseOnce([{ name: 'orders' }, { name: 'customers' }]);
        attachExploreCacheStatementMetrics(database, {
            getCaller: () => 'ProjectModel.getAllExploreSummaries',
            log,
            now,
        });

        await database('cached_explore').select('name');

        expect(log).toHaveBeenCalledExactlyOnceWith(
            expect.stringContaining('Knex.cachedExploreStatement'),
            expect.objectContaining({
                name: 'Knex.cachedExploreStatement',
                duration: 3.5,
                context: expect.objectContaining({
                    source: 'knex',
                    caller: 'ProjectModel.getAllExploreSummaries',
                    operation: 'select',
                    outcome: 'success',
                    returnedRowCount: 2,
                }),
                serverVersion: expect.any(String),
            }),
        );
        await database.destroy();
    });

    it('does not emit for another table', async () => {
        const database = knex({ client: MockClient, dialect: 'pg' });
        const log = vi.fn();
        getTracker().on.select('projects').responseOnce([]);
        attachExploreCacheStatementMetrics(database, { log });

        await database('projects').select('name');

        expect(log).not.toHaveBeenCalled();
        await database.destroy();
    });

    it('classifies cached explore statement operations', () => {
        const database = new EventEmitter();
        const log = vi.fn();
        attachExploreCacheStatementMetrics(database as unknown as Knex, {
            getCaller: () => undefined,
            log,
            now: () => 10,
        });
        const statements = [
            ['select', 'select * from cached_explore', 'select'],
            ['insert', 'insert into cached_explore values (?)', 'insert'],
            ['update', 'update cached_explore set name = ?', 'update'],
            ['del', 'delete from cached_explore where name = ?', 'delete'],
            ['raw', 'select * from cached_explore', 'other'],
        ] as const;

        statements.forEach(([method, sql, operation], index) => {
            const query = {
                __knexQueryUid: String(index),
                method,
                sql,
            };
            database.emit('query', query);
            database.emit('query-response', [], query);
            expect(log).toHaveBeenNthCalledWith(
                index + 1,
                expect.any(String),
                expect.objectContaining({
                    context: expect.objectContaining({ operation }),
                }),
            );
        });
    });

    it('drops the oldest pending statement when the cap is reached', () => {
        const database = new EventEmitter();
        const log = vi.fn();
        attachExploreCacheStatementMetrics(database as unknown as Knex, {
            getCaller: () => undefined,
            log,
            maxPendingStatements: 2,
            now: () => 10,
        });
        const statements = [
            {
                __knexQueryUid: 'oldest',
                method: 'insert',
                sql: 'insert into cached_explore values (?)',
            },
            {
                __knexQueryUid: 'middle',
                method: 'update',
                sql: 'update cached_explore set name = ?',
            },
            {
                __knexQueryUid: 'newest',
                method: 'del',
                sql: 'delete from cached_explore where name = ?',
            },
        ];

        statements.forEach((query) => database.emit('query', query));
        statements.forEach((query) =>
            database.emit('query-response', [], query),
        );

        expect(log).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenNthCalledWith(
            1,
            expect.any(String),
            expect.objectContaining({
                context: expect.objectContaining({ operation: 'update' }),
            }),
        );
        expect(log).toHaveBeenNthCalledWith(
            2,
            expect.any(String),
            expect.objectContaining({
                context: expect.objectContaining({ operation: 'delete' }),
            }),
        );
    });

    it('emits an error record when a cached explore statement fails', async () => {
        const database = knex({ client: MockClient, dialect: 'pg' });
        const log = vi.fn();
        const now = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(12);
        getTracker()
            .on.select('cached_explore')
            .simulateErrorOnce(new Error('query failed'));
        attachExploreCacheStatementMetrics(database, { log, now });

        await expect(database('cached_explore').select('name')).rejects.toThrow(
            'query failed',
        );

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('Knex.cachedExploreStatement'),
            expect.objectContaining({
                duration: 2,
                context: expect.objectContaining({
                    source: 'knex',
                    operation: 'select',
                    outcome: 'error',
                }),
            }),
        );
        await database.destroy();
    });

    it('does not attach listeners when disabled', async () => {
        vi.stubEnv(
            'LIGHTDASH_EXPLORE_CACHE_STATEMENT_METRICS_ENABLED',
            'false',
        );
        const database = knex({ client: MockClient, dialect: 'pg' });
        const log = vi.fn();
        getTracker().on.select('cached_explore').responseOnce([]);
        attachExploreCacheStatementMetrics(database, { log });

        await database('cached_explore').select('name');

        expect(log).not.toHaveBeenCalled();
        await database.destroy();
    });
});

describe('summarizeCatalogSearchExploreRead', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reports the bytes selected for each distinct explore once', () => {
        const orders = explore('orders', ['orders', 'customers']);
        const payments = explore('payments', ['payments']);
        const ordersBytes = Buffer.byteLength(JSON.stringify(orders), 'utf8');
        const paymentsBytes = Buffer.byteLength(
            JSON.stringify(payments),
            'utf8',
        );
        const stringify = vi.spyOn(JSON, 'stringify');

        const summary = summarizeCatalogSearchExploreRead(3, {
            'cached-orders': orders,
            'cached-payments': payments,
        });

        expect(summary).toEqual({
            exploreCount: 2,
            tableFanOut: 3,
            returnedSqlRowCount: 3,
            distinctExploreCount: 2,
            selectedExploreJsonBytes: ordersBytes + paymentsBytes,
        });
        expect(stringify).toHaveBeenCalledTimes(2);
    });
});
