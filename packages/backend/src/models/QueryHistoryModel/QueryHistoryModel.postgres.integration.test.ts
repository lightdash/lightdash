import { QueryExecutionContext, QueryHistoryStatus } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { buildAccount } from '../../auth/account/account.mock';
import { QueryHistoryModel } from './QueryHistoryModel';

describe('cancelRunningQueriesReadOnlyBy (PostgreSQL)', () => {
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
            `CREATE TEMP TABLE query_history (query_uuid uuid, project_uuid uuid, status text, created_by_user_uuid text, created_by_account text, context text, created_at timestamptz DEFAULT clock_timestamp(), duckdb_execution jsonb, request_parameters jsonb) ON COMMIT DROP`,
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
});
