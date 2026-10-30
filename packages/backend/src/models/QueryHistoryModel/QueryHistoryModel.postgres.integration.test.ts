import {
    DimensionType,
    QueryExecutionContext,
    QueryHistoryStatus,
    type QueryResultProducer,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type DbQueryHistory } from '../../database/entities/queryHistory';
import { CommercialCacheService } from '../../ee/services/CommercialCacheService';
import { QueryHistoryModel } from './QueryHistoryModel';

describe('QueryHistoryModel (PostgreSQL)', () => {
    let database: Knex;
    let tx: Knex.Transaction;
    let model: QueryHistoryModel;
    const projectUuid = randomUUID();
    const consumer = randomUUID();
    const account = buildAccount();

    const insert = async ({
        queryUuid = randomUUID(),
        status = QueryHistoryStatus.EXECUTING,
        project = projectUuid,
        createdBy = account.user.id,
        duckdbReferences = null,
        requestReferences = null,
    }: {
        queryUuid?: string;
        status?: QueryHistoryStatus;
        project?: string;
        createdBy?: string;
        duckdbReferences?: Record<string, string> | null;
        requestReferences?: Record<string, string> | null;
    } = {}) => {
        await tx<{
            query_uuid: string;
            project_uuid: string;
            status: QueryHistoryStatus;
            created_by_user_uuid: string;
            context: QueryExecutionContext;
            duckdb_execution: { references: Record<string, string> } | null;
            request_parameters: { references?: Record<string, string> };
        }>('query_history').insert({
            query_uuid: queryUuid,
            project_uuid: project,
            status,
            created_by_user_uuid: createdBy,
            context: QueryExecutionContext.EXPLORE,
            duckdb_execution: duckdbReferences
                ? { references: duckdbReferences }
                : null,
            request_parameters: requestReferences
                ? { references: requestReferences }
                : {},
        });
        return queryUuid;
    };
    const statusOf = async (queryUuid: string) =>
        (
            await tx<{ query_uuid: string; status: QueryHistoryStatus }>(
                'query_history',
            )
                .where('query_uuid', queryUuid)
                .first()
        )?.status;
    const cancel = async (legs: string[]) =>
        (
            await model.cancelRunningQueriesReadOnlyBy(
                legs,
                projectUuid,
                consumer,
                account,
            )
        ).map((leg) => leg.queryUuid);

    beforeAll(() => {
        if (!process.env.PGDATABASE && !process.env.PGCONNECTIONURI)
            throw new Error(
                'Set PGCONNECTIONURI or PG connection variables for PostgreSQL tests',
            );
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
        });
    });
    beforeEach(async () => {
        tx = await database.transaction();
        await tx.raw(
            `CREATE TEMP TABLE query_history (query_uuid uuid, project_uuid uuid, status text, created_by_user_uuid text, created_by_account text, context text, created_at timestamptz DEFAULT clock_timestamp(), duckdb_execution jsonb, request_parameters jsonb, cache_key text, agent_identity jsonb, results_file_name text, results_created_at timestamptz, results_updated_at timestamptz, results_expires_at timestamptz, total_row_count bigint, columns jsonb, cache_generation integer NOT NULL DEFAULT 0, cache_invalidated_at timestamptz) ON COMMIT DROP`,
        );
        await tx.raw(
            `CREATE TEMP TABLE projects (project_uuid uuid, results_cache_generation integer NOT NULL DEFAULT 0) ON COMMIT DROP`,
        );
        await tx<{ project_uuid: string }>('projects').insert({
            project_uuid: projectUuid,
        });
        model = new QueryHistoryModel({ database: tx });
    });
    afterEach(async () => {
        await tx?.rollback();
    });
    afterAll(async () => {
        await database?.destroy();
    });

    it('cancels running legs and leaves finished ones', async () => {
        const executing = await insert();
        const pending = await insert({ status: QueryHistoryStatus.PENDING });
        const ready = await insert({ status: QueryHistoryStatus.READY });
        const otherProject = await insert({ project: randomUUID() });

        const cancelled = await model.cancelRunningQueriesReadOnlyBy(
            [executing, pending, ready, otherProject],
            projectUuid,
            consumer,
            account,
        );

        expect(
            cancelled
                .map(({ queryUuid, previousStatus, context }) => ({
                    queryUuid,
                    previousStatus,
                    context,
                }))
                .sort((a, b) => a.queryUuid.localeCompare(b.queryUuid)),
        ).toEqual(
            [
                {
                    queryUuid: executing,
                    previousStatus: QueryHistoryStatus.EXECUTING,
                    context: QueryExecutionContext.EXPLORE,
                },
                {
                    queryUuid: pending,
                    previousStatus: QueryHistoryStatus.PENDING,
                    context: QueryExecutionContext.EXPLORE,
                },
            ].sort((a, b) => a.queryUuid.localeCompare(b.queryUuid)),
        );
        expect(await statusOf(executing)).toBe(QueryHistoryStatus.CANCELLED);
        expect(await statusOf(pending)).toBe(QueryHistoryStatus.CANCELLED);
        expect(await statusOf(ready)).toBe(QueryHistoryStatus.READY);
        expect(await statusOf(otherProject)).toBe(QueryHistoryStatus.EXECUTING);
    });

    it('leaves a leg another running query reads', async () => {
        const readByCompose = await insert();
        const readByPython = await insert();
        await insert({ duckdbReferences: { orders: readByCompose } });
        await insert({ requestReferences: { orders: readByPython } });

        expect(await cancel([readByCompose, readByPython])).toEqual([]);
        expect(await statusOf(readByCompose)).toBe(
            QueryHistoryStatus.EXECUTING,
        );
        expect(await statusOf(readByPython)).toBe(QueryHistoryStatus.EXECUTING);
    });

    it('cancels a leg read only by the consumer, finished queries or another project', async () => {
        const leg = await insert();
        await insert({
            queryUuid: consumer,
            duckdbReferences: { merge_source_0: leg },
        });
        await insert({
            status: QueryHistoryStatus.READY,
            duckdbReferences: { orders: leg },
        });
        await insert({
            project: randomUUID(),
            duckdbReferences: { orders: leg },
        });

        expect(await cancel([leg])).toEqual([leg]);
        expect(await statusOf(leg)).toBe(QueryHistoryStatus.CANCELLED);
    });

    it("leaves another account's legs", async () => {
        const leg = await insert({ createdBy: randomUUID() });

        expect(await cancel([leg])).toEqual([]);
        expect(await statusOf(leg)).toBe(QueryHistoryStatus.EXECUTING);
    });

    it('runs no query without legs', async () => {
        expect(await cancel([])).toEqual([]);
    });

    describe('retention cleanup', () => {
        const cutoff = new Date('2026-01-31T00:00:00Z');
        const expired = new Date('2026-01-01T00:00:00Z');
        const recent = new Date('2026-02-15T00:00:00Z');
        const insertAt = (createdAt: Date, count: number) =>
            tx<{
                query_uuid: string;
                project_uuid: string;
                status: QueryHistoryStatus;
                created_by_user_uuid: string;
                context: QueryExecutionContext;
                request_parameters: Record<string, never>;
                created_at: Date;
            }>('query_history').insert(
                Array.from({ length: count }, () => ({
                    query_uuid: randomUUID(),
                    project_uuid: projectUuid,
                    status: QueryHistoryStatus.READY,
                    created_by_user_uuid: account.user.id,
                    context: QueryExecutionContext.EXPLORE,
                    request_parameters: {},
                    created_at: createdAt,
                })),
            );
        const remainingRows = () =>
            tx<{ created_at: Date }>('query_history').select('created_at');
        const generous = {
            batchSize: 10,
            delayMs: 0,
            maxBatches: 10,
        };

        it('clears a backlog spanning many batches within the caps and keeps rows inside retention', async () => {
            await insertAt(expired, 25);
            await insertAt(recent, 5);

            const result = await model.cleanupBatch(cutoff, generous);

            expect(result).toMatchObject({ totalDeleted: 25, completed: true });
            const rows = await remainingRows();
            expect(rows).toHaveLength(5);
            expect(rows.every((row) => row.created_at >= cutoff)).toBe(true);
            expect(await model.countOlderThan(cutoff)).toBe(0);
        });

        it('stops at the batch cap and reports the backlog left behind', async () => {
            await insertAt(expired, 25);

            const result = await model.cleanupBatch(cutoff, {
                ...generous,
                maxBatches: 2,
            });

            expect(result).toMatchObject({
                totalDeleted: 20,
                completed: false,
            });
            expect(await model.countOlderThan(cutoff)).toBe(5);
        });
    });

    describe('result cache provenance', () => {
        const producer: QueryResultProducer = {
            version: 1,
            warehouseConnectionUuid: null,
            credentialOwner: {
                kind: 'shared_connection',
                identityFingerprint: 'shared-connection',
            },
            agentIdentity: null,
            entitlementFingerprint: 'current-access',
        };

        const insertCachedResult = async (
            cacheSourceQueryUuid: string | null,
            createdAt: Date,
        ) => {
            const source = cacheSourceQueryUuid
                ? await model.get(cacheSourceQueryUuid, projectUuid, account)
                : null;
            const queryUuid = await insert({
                status: QueryHistoryStatus.READY,
            });
            await tx<DbQueryHistory>('query_history')
                .where('query_uuid', queryUuid)
                .update({
                    cache_key: 'cache-key',
                    created_at: createdAt,
                    request_parameters: {
                        sql: 'SELECT 1',
                        resultProducer: producer,
                        ...(cacheSourceQueryUuid
                            ? { cacheSourceQueryUuid }
                            : {}),
                    },
                    results_file_name: 'original.jsonl',
                    results_created_at: source?.resultsCreatedAt ?? createdAt,
                    results_updated_at: source?.resultsUpdatedAt ?? createdAt,
                    results_expires_at:
                        source?.resultsExpiresAt ??
                        new Date(Date.now() + 86400000),
                    total_row_count: 1,
                    columns: {
                        value: {
                            type: DimensionType.NUMBER,
                            reference: 'value',
                        },
                    },
                });
            return queryUuid;
        };

        it('reuses the original execution after an existing chain and 60 more cache hits', async () => {
            const now = Date.now();
            const original = await insertCachedResult(null, new Date(now));
            const indexes = Array.from({ length: 60 }, (_, index) => index);
            const oldChainTip = await indexes.reduce(
                async (previous, index) =>
                    insertCachedResult(
                        await previous,
                        new Date(now + index + 1),
                    ),
                Promise.resolve(original),
            );
            const service = new CommercialCacheService({
                lightdashConfig: lightdashConfigMock,
                queryHistoryModel: model,
                projectModel: {
                    getEffectiveResultsCacheTtlSeconds: vi.fn(
                        async () => 86400,
                    ),
                } as never,
                featureFlagModel: {
                    get: vi.fn(async () => ({ enabled: true })),
                } as never,
                storageClient: {} as never,
            });
            const newestAlias = await indexes.reduce(
                async (previous, index) => {
                    await previous;
                    const hit = await service.findCachedResultsFile(
                        projectUuid,
                        'cache-key',
                        { userUuid: account.user.id },
                        producer,
                        true,
                    );
                    expect(hit).toMatchObject({
                        cacheHit: true,
                        queryUuid: original,
                        fileName: 'original.jsonl',
                        resultProducer: producer,
                    });
                    if (!hit?.queryUuid)
                        throw new Error(
                            'Expected a cache hit with its source query',
                        );
                    const alias = await insertCachedResult(
                        hit.queryUuid,
                        new Date(now + 61 + index),
                    );
                    const read = await model.get(alias, projectUuid, account);
                    expect(read).toMatchObject({
                        status: QueryHistoryStatus.READY,
                        resultsFileName: 'original.jsonl',
                        requestParameters: {
                            cacheSourceQueryUuid: original,
                            resultProducer: producer,
                        },
                    });
                    return alias;
                },
                Promise.resolve(oldChainTip),
            );
            await expect(
                model.findMostRecentByCacheKey('cache-key', projectUuid, {
                    excludeAgentProduced: true,
                    excludeCacheHits: false,
                }),
            ).resolves.toMatchObject({ queryUuid: newestAlias });
        });

        describe('after a chart or dashboard cache is invalidated', () => {
            const tagRun = (
                queryUuid: string,
                tags: Record<string, string>,
                cacheKey = 'cache-key',
            ) =>
                tx<DbQueryHistory>('query_history')
                    .where('query_uuid', queryUuid)
                    .update({
                        cache_key: cacheKey,
                        request_parameters: {
                            sql: 'SELECT 1',
                            resultProducer: producer,
                            ...tags,
                        },
                    });
            const invalidate = (type: 'chart' | 'dashboard', id: string) =>
                model.invalidateCachedResultsForContent(
                    projectUuid,
                    { type, identifiers: [id] },
                    new Date(Date.now() - 86400000),
                );
            const findLatest = (cacheKey = 'cache-key') =>
                model.findMostRecentByCacheKey(cacheKey, projectUuid, {
                    excludeAgentProduced: true,
                });

            it('expires every run that shares the chart cache key', async () => {
                const chartRun = await insertCachedResult(
                    null,
                    new Date(Date.now()),
                );
                await tagRun(chartRun, { chartUuid: 'chart-a' });
                // Same SQL from Explore, not tagged with the chart
                await insertCachedResult(null, new Date(Date.now() + 1));

                await expect(invalidate('chart', 'chart-a')).resolves.toBe(2);
                await expect(findLatest()).resolves.toBeUndefined();

                const fresh = await insertCachedResult(
                    null,
                    new Date(Date.now() + 2),
                );
                await expect(findLatest()).resolves.toMatchObject({
                    queryUuid: fresh,
                });
            });

            it('expires dashboard tiles and leaves other content cached', async () => {
                const tile = await insertCachedResult(
                    null,
                    new Date(Date.now()),
                );
                await tagRun(tile, {
                    chartUuid: 'chart-a',
                    dashboardUuid: 'dashboard-a',
                });
                const otherChart = await insertCachedResult(
                    null,
                    new Date(Date.now()),
                );
                await tagRun(otherChart, { chartUuid: 'chart-b' }, 'other-key');

                await expect(
                    invalidate('dashboard', 'dashboard-a'),
                ).resolves.toBe(1);
                await expect(findLatest()).resolves.toBeUndefined();
                await expect(findLatest('other-key')).resolves.toMatchObject({
                    queryUuid: otherChart,
                });
            });
        });

        describe('after the project cache is invalidated', () => {
            const invalidate = () =>
                tx('projects')
                    .where('project_uuid', projectUuid)
                    .increment('results_cache_generation', 1);
            const setGeneration = (queryUuid: string, generation: number) =>
                tx('query_history')
                    .where('query_uuid', queryUuid)
                    .update({ cache_generation: generation });
            const findLatest = () =>
                model.findMostRecentByCacheKey('cache-key', projectUuid, {
                    excludeAgentProduced: true,
                });

            it('ignores results from the previous generation', async () => {
                const original = await insertCachedResult(
                    null,
                    new Date(Date.now()),
                );
                await expect(findLatest()).resolves.toMatchObject({
                    queryUuid: original,
                    cacheGeneration: 0,
                });

                await invalidate();
                await expect(findLatest()).resolves.toBeUndefined();

                const fresh = await insertCachedResult(
                    null,
                    new Date(Date.now() + 1),
                );
                await setGeneration(fresh, 1);
                await expect(findLatest()).resolves.toMatchObject({
                    queryUuid: fresh,
                    cacheGeneration: 1,
                });
            });

            it('ignores a query that started before and finished after', async () => {
                const inFlight = await insertCachedResult(
                    null,
                    new Date(Date.now()),
                );
                await invalidate();
                await tx('query_history')
                    .where('query_uuid', inFlight)
                    .update({ results_updated_at: new Date(Date.now() + 1) });

                await expect(findLatest()).resolves.toBeUndefined();
            });

            it('ignores newer cache hits that kept the old generation', async () => {
                const now = Date.now();
                const original = await insertCachedResult(null, new Date(now));
                await invalidate();
                await insertCachedResult(original, new Date(now + 1));

                await expect(findLatest()).resolves.toBeUndefined();
            });

            it('leaves other projects cached', async () => {
                const otherProject = randomUUID();
                await tx<{ project_uuid: string }>('projects').insert({
                    project_uuid: otherProject,
                });
                const other = await insert({
                    status: QueryHistoryStatus.READY,
                    project: otherProject,
                });
                await tx('query_history')
                    .where('query_uuid', other)
                    .update({ cache_key: 'cache-key' });
                await invalidate();

                await expect(
                    model.findMostRecentByCacheKey('cache-key', otherProject, {
                        excludeAgentProduced: true,
                    }),
                ).resolves.toMatchObject({ queryUuid: other });
            });
        });

        it.each(['missing', 'null'] as const)(
            'selects the newest execution with a %s cache source',
            async (source) => {
                const now = Date.now();
                await insertCachedResult(null, new Date(now));
                const newestExecution = await insertCachedResult(
                    null,
                    new Date(now + 1),
                );
                if (source === 'null') {
                    const requestParameters = {
                        sql: 'SELECT 1',
                        resultProducer: producer,
                        cacheSourceQueryUuid: null,
                    };
                    await tx<{
                        request_parameters: typeof requestParameters;
                    }>('query_history')
                        .where('query_uuid', newestExecution)
                        .update({
                            request_parameters: requestParameters,
                        });
                }
                await insertCachedResult(newestExecution, new Date(now + 2));
                await expect(
                    model.findMostRecentByCacheKey('cache-key', projectUuid, {
                        excludeAgentProduced: true,
                        excludeCacheHits: true,
                    }),
                ).resolves.toMatchObject({ queryUuid: newestExecution });
            },
        );
    });
});
