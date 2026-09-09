import knex from 'knex';
import { randomUUID } from 'node:crypto';
import { up } from '../database/migrations/20260909120000_create_user_recent_content';
import { RecentContentModel } from '../models/RecentContentModel';

async function main() {
    if (!process.env.PGDATABASE)
        throw new Error(
            'Set PG connection variables to a disposable PostgreSQL database',
        );
    const schema = `recent_benchmark_${randomUUID().replaceAll('-', '')}`;
    const db = knex({
        client: 'pg',
        connection: {
            host: process.env.PGHOST,
            port: Number(process.env.PGPORT),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
        },
        searchPath: [schema],
        pool: { min: 0, max: 10 },
    });
    try {
        await db.schema.createSchema(schema);
        await db.schema.createTable('users', (t) =>
            t.uuid('user_uuid').primary(),
        );
        await db.schema.createTable('projects', (t) =>
            t.uuid('project_uuid').primary(),
        );
        await db.transaction(up);
        const projectUuid = randomUUID();
        await db<{ project_uuid: string }>('projects').insert({
            project_uuid: projectUuid,
        });
        await db.raw(
            'INSERT INTO users SELECT gen_random_uuid() FROM generate_series(1, 10000)',
        );
        const started = performance.now();
        await db.raw(
            `INSERT INTO user_recent_content SELECT user_uuid, ?::uuid, 'chart', gen_random_uuid(), now() - n * interval '1 second' FROM users CROSS JOIN generate_series(1,50) n`,
            [projectUuid],
        );
        await db.raw('ANALYZE user_recent_content');
        const user = await db<{ user_uuid: string }>('users').first();
        if (!user) throw new Error('Benchmark user missing');
        const userUuid = user.user_uuid;
        const model = new RecentContentModel(db);
        const readTimes: number[] = [];
        const writeTimes: number[] = [];
        /* eslint-disable no-await-in-loop -- Measure sequential request latency. */
        for (let i = 0; i < 100; i += 1) {
            let t = performance.now();
            await model.find(userUuid, projectUuid);
            readTimes.push(performance.now() - t);
            t = performance.now();
            await model.recordView({
                userUuid,
                projectUuid,
                contentType: 'chart',
                contentUuid: randomUUID(),
                viewedAt: new Date(),
            });
            writeTimes.push(performance.now() - t);
        }
        /* eslint-enable no-await-in-loop */
        const metrics = (times: number[]) => {
            times.sort((a, b) => a - b);
            return { p50ms: times[49], p95ms: times[94], maxMs: times[99] };
        };
        const sizes = await db.raw<{
            rows: {
                table_bytes: string;
                index_bytes: string;
                total_bytes: string;
            }[];
        }>(
            `SELECT pg_table_size('user_recent_content') AS table_bytes, pg_indexes_size('user_recent_content') AS index_bytes, pg_total_relation_size('user_recent_content') AS total_bytes`,
        );
        const plan = await db.raw<{ rows: { 'QUERY PLAN': string }[] }>(
            `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM user_recent_content WHERE user_uuid = ? AND project_uuid = ? AND last_viewed_at > now() - interval '90 days' ORDER BY last_viewed_at DESC, content_type, content_uuid LIMIT 50`,
            [userUuid, projectUuid],
        );
        console.log(
            JSON.stringify(
                {
                    rows: 500000,
                    pairs: 10000,
                    fixtureAndBenchmarkMs: performance.now() - started,
                    read: metrics(readTimes),
                    write: metrics(writeTimes),
                    sizes: sizes.rows,
                    plan: plan.rows,
                },
                null,
                2,
            ),
        );
    } finally {
        await db.schema.dropSchemaIfExists(schema, true);
        await db.destroy();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
