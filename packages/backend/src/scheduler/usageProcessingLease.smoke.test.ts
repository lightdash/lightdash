import { SCHEDULER_TASKS } from '@lightdash/common';
import { randomUUID } from 'crypto';
import { makeWorkerUtils, type Job, type WorkerUtils } from 'graphile-worker';
import { Pool } from 'pg';
import { renewUsageProcessingLease } from './usageProcessingLease';

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
        const claim = async (worker: string): Promise<Job> => {
            const { rows } = await query(
                'SELECT * FROM graphile_worker.get_job($1)',
                [worker],
            );
            return rows[0] as Job;
        };
        const startTwo = async () => {
            for (let i = 0; i < 2; i += 1) {
                // eslint-disable-next-line no-await-in-loop
                await utils.addJob(
                    SCHEDULER_TASKS.COMPACT_USAGE_EVENTS,
                    {},
                    { queueName: 'usage-events-compaction', maxAttempts: 1 },
                );
            }
            const first = await claim('worker-first');
            await query(
                "UPDATE graphile_worker.jobs SET locked_at = now() - interval '5 hours' WHERE id = $1",
                [first.id],
            );
            await query(
                "UPDATE graphile_worker.job_queues SET locked_at = now() - interval '5 hours'",
            );
            return first;
        };
        it('reproduces overlap after four hours without renewal', async () => {
            const first = await startTwo();
            const second = await claim('worker-second');
            expect(second.id).toBeTruthy();
            expect(second.id).not.toBe(first.id);
        });
        it('keeps a second worker blocked after a five-hour run and releases normally', async () => {
            const first = await startTwo();
            await renewUsageProcessingLease({
                job: first,
                withPgClient: utils.withPgClient,
            });
            expect((await claim('worker-second')).id).toBeNull();
            const { rows } = await query(
                "SELECT j.locked_at = q.locked_at AS same, j.locked_at > now() - interval '1 minute' AS fresh FROM graphile_worker.jobs j JOIN graphile_worker.job_queues q USING(queue_name) WHERE j.id = $1",
                [first.id],
            );
            expect(rows[0]).toEqual({ same: true, fresh: true });
            await query('SELECT graphile_worker.complete_job($1, $2)', [
                first.locked_by,
                first.id,
            ]);
            expect((await claim('worker-second')).id).toBeTruthy();
        });
        it('never renews either row after another worker owns the queue', async () => {
            const first = await startTwo();
            const second = await claim('worker-second');
            const before = await query(
                'SELECT id, locked_at FROM graphile_worker.jobs ORDER BY id',
            );
            await expect(
                renewUsageProcessingLease({
                    job: first,
                    withPgClient: utils.withPgClient,
                }),
            ).rejects.toThrow('lost its job or queue lease');
            expect(
                (
                    await query(
                        'SELECT id, locked_at FROM graphile_worker.jobs ORDER BY id',
                    )
                ).rows,
            ).toEqual(before.rows);
            expect(
                (
                    await query(
                        'SELECT locked_by FROM graphile_worker.job_queues',
                    )
                ).rows[0].locked_by,
            ).toBe(second.locked_by);
        });
    },
);
