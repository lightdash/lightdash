import { SCHEDULER_TASKS } from '@lightdash/common';
import { randomUUID } from 'crypto';
import { makeWorkerUtils, type Job, type WorkerUtils } from 'graphile-worker';
import { Pool } from 'pg';
import { extendUsageProcessingLease } from './usageProcessingLease';

// Uses the actual installed Graphile schema/functions in a disposable database.
// Opt in with this task's isolated LOCAL Postgres port, never production.
describe.skipIf(!process.env.USAGE_LEASE_SMOKE_PGPORT)(
    'Graphile compaction lease concurrency',
    () => {
        let admin: Pool;
        let pool: Pool;
        let utils: WorkerUtils;
        const database = `usage_lease_${randomUUID().replaceAll('-', '')}`;
        beforeAll(async () => {
            const connection = {
                host: 'localhost',
                port: Number(process.env.USAGE_LEASE_SMOKE_PGPORT),
                user: 'postgres',
                password: 'password',
            };
            admin = new Pool({ ...connection, database: 'postgres' });
            await admin.query(`CREATE DATABASE "${database}"`);
            pool = new Pool({ ...connection, database });
            utils = await makeWorkerUtils({ pgPool: pool });
            await utils.migrate();
        });
        afterAll(async () => {
            await utils?.release();
            await pool?.end();
            if (admin) {
                await admin.query(
                    `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
                );
                await admin.end();
            }
        });
        const query = (sql: string, values?: unknown[]) =>
            utils.withPgClient((client) => client.query(sql, values));
        beforeEach(async () => {
            await query('DELETE FROM graphile_worker.jobs');
            await query('DELETE FROM graphile_worker.job_queues');
        });
        const claim = async (
            worker: string,
            elapsed = '0 hours',
        ): Promise<Job> => {
            const { rows } = await query(
                'SELECT * FROM graphile_worker.get_job($1, now := now() + $2::interval)',
                [worker, elapsed],
            );
            return rows[0] as Job;
        };
        const startTwo = async (
            task = SCHEDULER_TASKS.COMPACT_USAGE_EVENTS,
            queueName = 'usage-events-compaction',
        ) => {
            for (let i = 0; i < 2; i += 1) {
                // eslint-disable-next-line no-await-in-loop
                await utils.addJob(task, {}, { queueName, maxAttempts: 1 });
            }
            return claim('worker-first');
        };
        const extend = (job: Job) =>
            extendUsageProcessingLease({
                job,
                withPgClient: utils.withPgClient,
            });
        it('reproduces overlap after four hours without extension', async () => {
            const first = await startTwo();
            const second = await claim('worker-second', '5 hours');
            expect(second.id).toBeTruthy();
            expect(second.id).not.toBe(first.id);
        });
        it('protects five- and eleven-hour runs, then expires after twelve hours', async () => {
            const first = await startTwo();
            await extend(first);
            expect((await claim('worker-second', '5 hours')).id).toBeNull();
            expect((await claim('worker-second', '11 hours')).id).toBeNull();
            const { rows } = await query(
                "SELECT j.locked_at = q.locked_at AS same, j.locked_at > now() + interval '7 hours 59 minutes' AS extended FROM graphile_worker.jobs j JOIN graphile_worker.job_queues q USING(queue_name) WHERE j.id = $1",
                [first.id],
            );
            expect(rows[0]).toEqual({ same: true, extended: true });
            const second = await claim('worker-second', '12 hours 1 second');
            expect(second.id).toBeTruthy();
            expect(second.id).not.toBe(first.id);
        });
        it.each(['complete_job', 'fail_job'])(
            '%s releases the extended queue immediately',
            async (operation) => {
                const first = await startTwo();
                await extend(first);
                if (operation === 'complete_job') {
                    await query('SELECT graphile_worker.complete_job($1, $2)', [
                        first.locked_by,
                        first.id,
                    ]);
                } else {
                    await query('SELECT graphile_worker.fail_job($1, $2, $3)', [
                        first.locked_by,
                        first.id,
                        'Test failure',
                    ]);
                }
                const second = await claim('worker-second');
                expect(second.id).toBeTruthy();
                expect(second.id).not.toBe(first.id);
            },
        );
        it('preserves four-hour expiry for other queues', async () => {
            const first = await startTwo(
                SCHEDULER_TASKS.COMPILE_PROJECT,
                'normal',
            );
            expect((await claim('worker-second', '3 hours')).id).toBeNull();
            const second = await claim('worker-second', '4 hours 1 second');
            expect(second.id).toBeTruthy();
            expect(second.id).not.toBe(first.id);
        });
        it.each(['jobs', 'job_queues'])(
            'leaves both timestamps unchanged if %s ownership is lost',
            async (table) => {
                const first = await startTwo();
                if (table === 'jobs') {
                    await query(
                        "UPDATE graphile_worker.jobs SET locked_by = 'worker-other' WHERE id = $1",
                        [first.id],
                    );
                } else {
                    await query(
                        "UPDATE graphile_worker.job_queues SET locked_by = 'worker-other'",
                    );
                }
                const snapshot = async () =>
                    (
                        await query(
                            'SELECT j.id, j.locked_at, j.locked_by, q.locked_at AS queue_locked_at, q.locked_by AS queue_locked_by FROM graphile_worker.jobs j JOIN graphile_worker.job_queues q USING(queue_name) ORDER BY j.id',
                        )
                    ).rows;
                const before = await snapshot();
                await expect(extend(first)).rejects.toThrow(
                    'lost its job or queue lease',
                );
                expect(await snapshot()).toEqual(before);
            },
        );
    },
);
