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
            `CREATE TEMP TABLE query_history (query_uuid uuid, project_uuid uuid, status text, created_by_user_uuid text, created_by_account text, context text, created_at timestamptz DEFAULT clock_timestamp(), duckdb_execution jsonb, request_parameters jsonb, cache_key text, agent_identity jsonb, results_file_name text, results_created_at timestamptz, results_updated_at timestamptz, results_expires_at timestamptz, total_row_count bigint, columns jsonb) ON COMMIT DROP`,
        );
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
