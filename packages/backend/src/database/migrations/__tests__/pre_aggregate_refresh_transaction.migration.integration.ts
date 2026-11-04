import { ForbiddenError } from '@lightdash/common';
import { type Knex } from 'knex';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { seedConnectionClient } from './agentConnectionFixture.mock';
import {
    deferred,
    transactionFixture,
    writeBoundary,
    writeOperations,
} from './preAggregateRefreshTransaction.mock';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
});
afterAll(async () => migrated?.destroy());
afterEach(() => vi.restoreAllMocks());

const state = async (projectUuid: string) =>
    Promise.all(
        ['cached_explore', 'project_parameters', 'cached_explore_staging'].map(
            (table) =>
                migrated
                    .database(table)
                    .where('project_uuid', projectUuid)
                    .orderBy('name'),
        ),
    );

test.each(writeOperations)(
    'person first: %s refuses inside the transaction and cleans staging',
    async (operation) => {
        const f = await transactionFixture(migrated.database, operation);
        const admitted = deferred();
        const release = deferred();
        const { original, spy } = writeBoundary(f, operation);
        spy.mockImplementationOnce(async (...args) => {
            admitted.resolve();
            await release.promise;
            return original(...args);
        });
        const guard = vi.spyOn(f.projects, 'getPreAggregateRefreshSummary');
        const writing = agentExecutionContext.run(f.scope, f.run).then(
            () => null,
            (error: unknown) => error,
        );
        let before: Awaited<ReturnType<typeof state>>;
        try {
            await admitted.promise;
            expect(guard.mock.calls.length).toBeGreaterThan(0);
            expect(
                guard.mock.calls.every((args) => args[1] === undefined),
            ).toBe(true);
            await f.projects.saveExploresToCache(
                f.projectUuid,
                [{ ...f.withCron(''), name: 'person_write' }],
                true,
            );
            before = await state(f.projectUuid);
        } finally {
            release.resolve();
        }
        expect(await writing).toBeInstanceOf(ForbiddenError);
        expect(guard.mock.calls.some((args) => args[1] !== undefined)).toBe(
            true,
        );
        expect(await state(f.projectUuid)).toEqual(before!);
        expect(before![2]).toEqual([]);
    },
);

test.each(writeOperations)(
    'connection first: %s uses the lock backend and blocks the person until commit',
    async (operation) => {
        const f = await transactionFixture(migrated.database, operation);
        const release = deferred();
        const original = f.projects.getPreAggregateRefreshSummary.bind(
            f.projects,
        );
        let pid: number | undefined;
        let lockPid: number | undefined;
        const lock = ProjectModel.lockAndEnsureCachedExplores;
        vi.spyOn(
            ProjectModel,
            'lockAndEnsureCachedExplores',
        ).mockImplementation(async (trx, id) => {
            await lock(trx, id);
            const backend = await trx.raw<{ rows: { pid: number }[] }>(
                'select pg_backend_pid() as pid',
            );
            lockPid ??= backend.rows[0].pid;
        });
        let lockConnection: string | undefined;
        let guardConnection: string | undefined;
        const record = (query: { sql: string; __knexUid: string }) => {
            if (
                lockConnection === undefined &&
                /from "cached_explores".*for update/.test(query.sql)
            )
                lockConnection = query.__knexUid;
            if (
                pid !== undefined &&
                query.sql.includes('hasMalformedPreAggregates')
            )
                guardConnection = query.__knexUid;
        };
        migrated.database.on('query', record);
        vi.spyOn(
            f.projects,
            'getPreAggregateRefreshSummary',
        ).mockImplementation(async (id, trx) => {
            if (trx) {
                const backend = await trx.raw<{ rows: { pid: number }[] }>(
                    'select pg_backend_pid() as pid',
                );
                pid = backend.rows[0].pid;
                await release.promise;
            }
            return original(id, trx);
        });
        const order: string[] = [];
        const writing = agentExecutionContext.run(f.scope, f.run).then(() => {
            order.push('connection');
        });
        let person: Promise<unknown> | undefined;
        try {
            await vi.waitFor(() => expect(pid).toBeTypeOf('number'), {
                timeout: 5000,
            });
            person = f.projects
                .saveExploresToCache(
                    f.projectUuid,
                    [{ ...f.withCron(''), name: 'person_write' }],
                    true,
                )
                .then(() => {
                    order.push('person');
                });
            await vi.waitFor(
                async () => {
                    const blockers = await migrated.database.raw<{
                        rows: { pid: number }[];
                    }>(
                        'select pid from pg_stat_activity where ? = ANY(pg_blocking_pids(pid)) and wait_event_type = ?',
                        [pid, 'Lock'],
                    );
                    expect(blockers.rows.length).toBeGreaterThan(0);
                    expect(blockers.rows.every((row) => row.pid !== pid)).toBe(
                        true,
                    );
                    expect(order).toEqual([]);
                },
                { timeout: 5000 },
            );
        } finally {
            release.resolve();
            await writing;
            await person;
            migrated.database.off('query', record);
        }
        // Both finished; which promise settles first is not the commit order.
        expect([...order].sort()).toEqual(['connection', 'person']);
        expect(pid).toBe(lockPid);
        expect(guardConnection).toBeDefined();
        expect(guardConnection).toBe(lockConnection);
        const [explores, parameters, staged] = await state(f.projectUuid);
        expect(explores.map((row) => row.name)).toEqual(
            operation.startsWith('virtual-')
                ? ['guard_view', 'person_write']
                : ['person_write'],
        );
        expect(
            explores.find((row) => row.name === 'person_write').explore
                .preAggregates[0].refresh.cron,
        ).toBe('');
        if (operation === 'parameters')
            expect(parameters.map((row) => row.name)).toEqual(['region']);
        expect(staged).toEqual([]);
    },
);

test.each(['parameters', 'explores'])(
    'ordinary %s holds its write while the connection parameter write waits and both finish',
    async (operation) => {
        const f = await transactionFixture(migrated.database, 'parameters');
        await f.parameters.replace(f.projectUuid, {
            existing: { type: 'string', default: 'value' },
        } as never);
        const held = deferred();
        const release = deferred();
        const client = Object.getPrototypeOf(
            migrated.database.client,
        ) as Knex.Client;
        const { query } = client;
        let ordinaryPid: number | undefined;
        const observer = vi
            .spyOn(client, 'query')
            .mockImplementation(
                async function observe(
                    this: Knex.Client,
                    connection,
                    statement,
                ) {
                    const sql =
                        typeof statement === 'string'
                            ? statement
                            : statement.sql;
                    const result = await query.call(
                        this,
                        connection,
                        statement,
                    );
                    const target =
                        operation === 'parameters'
                            ? /^delete from "project_parameters"/.test(sql)
                            : /from "cached_explores".*for update/.test(sql);
                    if (target && ordinaryPid === undefined) {
                        ordinaryPid = connection.processID;
                        held.resolve();
                        await release.promise;
                    }
                    return result;
                },
            );
        const order: string[] = [];
        const ordinary = (
            operation === 'parameters'
                ? f.parameters.replace(f.projectUuid, {
                      ordinary: { type: 'string', default: 'value' },
                  } as never)
                : f.projects.saveExploresToCache(
                      f.projectUuid,
                      [validExplore],
                      true,
                  )
        ).then(() => {
            order.push('ordinary');
        });
        let writing: Promise<unknown> | undefined;
        try {
            await held.promise;
            writing = agentExecutionContext.run(f.scope, f.run).then(() => {
                order.push('connection');
            });
            await vi.waitFor(
                async () => {
                    const blocked = await migrated.database.raw<{
                        rows: { pid: number }[];
                    }>(
                        'select pid from pg_stat_activity where ? = ANY(pg_blocking_pids(pid)) and wait_event_type = ?',
                        [ordinaryPid, 'Lock'],
                    );
                    expect(blocked.rows.length).toBeGreaterThan(0);
                    expect(order).toEqual([]);
                },
                { timeout: 5000 },
            );
        } finally {
            release.resolve();
            await ordinary;
            await writing;
            observer.mockRestore();
        }
        expect(order).toEqual(['ordinary', 'connection']);
        const [, parameters, staged] = await state(f.projectUuid);
        expect(parameters.map((row) => row.name)).toEqual(
            operation === 'parameters' ? ['ordinary', 'region'] : ['region'],
        );
        expect(staged).toEqual([]);
    },
);

test.each(writeOperations)(
    '%s adds only the authoritative guard statements',
    async (operation) => {
        const f = await transactionFixture(migrated.database, operation);
        const statements: string[] = [];
        const record = (query: { sql: string }) => {
            if (query.sql.includes('hasMalformedPreAggregates'))
                statements.push(query.sql);
        };
        migrated.database.on('query', record);
        try {
            await agentExecutionContext.run(f.scope, f.run);
        } finally {
            migrated.database.off('query', record);
        }
        const staged = operation === 'stream' || operation === 'multi';
        expect(statements).toHaveLength(staged ? 3 : 2);
        expect(
            statements.filter((sql) => sql.includes('cached_explore_staging')),
        ).toHaveLength(staged ? 1 : 0);
    },
);
