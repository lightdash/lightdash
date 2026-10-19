import { QueryHistoryStatus } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { QueryHistoryModel } from './QueryHistoryModel';

describe('findRunningQueriesReadOnlyBy (PostgreSQL)', () => {
    let database: Knex;
    let tx: Knex.Transaction;
    let model: QueryHistoryModel;
    const projectUuid = randomUUID();
    const consumer = randomUUID();

    const insert = async ({
        queryUuid = randomUUID(),
        status = QueryHistoryStatus.EXECUTING,
        project = projectUuid,
        duckdbReferences = null,
        requestReferences = null,
    }: {
        queryUuid?: string;
        status?: QueryHistoryStatus;
        project?: string;
        duckdbReferences?: Record<string, string> | null;
        requestReferences?: Record<string, string> | null;
    } = {}) => {
        await tx<{
            query_uuid: string;
            project_uuid: string;
            status: QueryHistoryStatus;
            duckdb_execution: { references: Record<string, string> } | null;
            request_parameters: { references?: Record<string, string> };
        }>('query_history').insert({
            query_uuid: queryUuid,
            project_uuid: project,
            status,
            duckdb_execution: duckdbReferences
                ? { references: duckdbReferences }
                : null,
            request_parameters: requestReferences
                ? { references: requestReferences }
                : {},
        });
        return queryUuid;
    };
    const find = (legs: string[]) =>
        model.findRunningQueriesReadOnlyBy(legs, projectUuid, consumer);

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
            `CREATE TEMP TABLE query_history (query_uuid uuid, project_uuid uuid, status text, created_at timestamptz DEFAULT clock_timestamp(), duckdb_execution jsonb, request_parameters jsonb) ON COMMIT DROP`,
        );
        model = new QueryHistoryModel({ database: tx });
    });
    afterEach(async () => {
        await tx?.rollback();
    });
    afterAll(async () => {
        await database?.destroy();
    });

    it('returns running legs and leaves finished ones', async () => {
        const executing = await insert();
        const pending = await insert({ status: QueryHistoryStatus.PENDING });
        const ready = await insert({ status: QueryHistoryStatus.READY });
        const otherProject = await insert({ project: randomUUID() });

        expect(
            (await find([executing, pending, ready, otherProject])).sort(),
        ).toEqual([executing, pending].sort());
    });

    it('leaves a leg another running query reads', async () => {
        const readByCompose = await insert();
        const readByPython = await insert();
        await insert({ duckdbReferences: { orders: readByCompose } });
        await insert({ requestReferences: { orders: readByPython } });

        expect(await find([readByCompose, readByPython])).toEqual([]);
    });

    it('returns a leg read only by the consumer, finished queries or another project', async () => {
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

        expect(await find([leg])).toEqual([leg]);
    });

    it('runs no query without legs', async () => {
        expect(await find([])).toEqual([]);
    });
});
