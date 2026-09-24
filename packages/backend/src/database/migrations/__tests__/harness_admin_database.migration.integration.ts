import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    createMigratedDatabase,
    getAdminDatabase,
    getPostgresServer,
} from '../../../testing/migratedDatabase';
import { createMigratedTestDatabase } from './migratedTestDatabase';

type HarnessDatabase = {
    databaseName: string;
    destroy: () => Promise<void>;
};

const harnesses: {
    harness: string;
    create: () => Promise<HarnessDatabase>;
}[] = [
    {
        harness: 'createMigratedTestDatabase',
        create: async () => {
            const migrated = await createMigratedTestDatabase('harness_admin');
            return {
                databaseName: (
                    migrated.database.client.config.connection as {
                        database: string;
                    }
                ).database,
                destroy: migrated.destroy,
            };
        },
    },
    {
        harness: 'createMigratedDatabase',
        create: async () => {
            const migrated = await createMigratedDatabase();
            return {
                databaseName: migrated.databaseName,
                destroy: migrated.destroy,
            };
        },
    },
];

describe('Real-schema harness admin sessions', () => {
    let target: Knex;
    let indexBuilder: Knex;
    let maintenance: Knex;
    const targetDatabase = `harness_admin_${randomUUID().replaceAll('-', '')}`;
    const previousPgDatabase = process.env.PGDATABASE;

    beforeAll(async () => {
        const server = getPostgresServer();
        const connection = (database: string, options?: string) => ({
            host: server.host,
            port: server.port,
            user: server.user,
            password: server.password,
            database,
            ...(options === undefined ? {} : { options }),
        });
        maintenance = knex({
            client: 'pg',
            connection: connection('postgres'),
            pool: { min: 0, max: 2 },
        });
        await maintenance.raw('CREATE DATABASE ??', [targetDatabase]);
        target = knex({
            client: 'pg',
            connection: connection(targetDatabase),
            pool: { min: 0, max: 1 },
        });
        indexBuilder = knex({
            client: 'pg',
            connection: connection(targetDatabase, '-c lock_timeout=1000'),
            pool: { min: 0, max: 1 },
        });
        await target.raw(
            'CREATE TABLE events (content_uuid uuid, happened_at timestamptz)',
        );
        await target.raw(
            'INSERT INTO events SELECT gen_random_uuid(), now() FROM generate_series(1, 10000)',
        );
    }, 600000);

    afterEach(() => {
        if (previousPgDatabase === undefined) delete process.env.PGDATABASE;
        else process.env.PGDATABASE = previousPgDatabase;
    });

    afterAll(async () => {
        await Promise.all([target?.destroy(), indexBuilder?.destroy()]);
        await maintenance?.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
            targetDatabase,
        ]);
        await maintenance?.destroy();
    });

    test('the admin database is the maintenance database, never PGDATABASE', () => {
        expect(getAdminDatabase({ PGDATABASE: 'lightdash' })).toBe('postgres');
        expect(
            getAdminDatabase({
                PGDATABASE: 'lightdash',
                PGADMINDATABASE: 'maintenance',
            }),
        ).toBe('maintenance');
    });

    test.each(harnesses)(
        'while $harness drops a database with PGDATABASE set to a database, an index builds concurrently in that database',
        async ({ create }) => {
            process.env.PGDATABASE = targetDatabase;
            const created = await create();
            const index = `events_${randomUUID().replaceAll('-', '')}`;
            const hold = await maintenance.transaction();
            let dropping: Promise<void> | undefined;
            try {
                await hold.raw('ALTER DATABASE ?? RENAME TO ??', [
                    created.databaseName,
                    `${created.databaseName}_held`,
                ]);
                dropping = created.destroy();
                const dropSession = await new Promise<{ datname: string }>(
                    (resolve, reject) => {
                        const deadline = Date.now() + 30000;
                        const poll = async () => {
                            const { rows } = await maintenance.raw<{
                                rows: { datname: string }[];
                            }>(
                                `SELECT datname FROM pg_stat_activity
                                 WHERE wait_event_type = 'Lock'
                                   AND query ILIKE 'DROP DATABASE%'
                                   AND query LIKE ?`,
                                [`%${created.databaseName}%`],
                            );
                            if (rows.length > 0) resolve(rows[0]);
                            else if (Date.now() > deadline)
                                reject(new Error('The drop never waited'));
                            else setTimeout(poll, 50);
                        };
                        poll().catch(reject);
                    },
                );

                const indexBuild = await indexBuilder
                    .raw(
                        'CREATE INDEX CONCURRENTLY ?? ON events (content_uuid, happened_at DESC)',
                        [index],
                    )
                    .then(
                        () => 'built',
                        (error: Error) => error.message,
                    );

                expect(indexBuild).toBe('built');
                expect(dropSession.datname).not.toBe(targetDatabase);
            } finally {
                await hold.rollback();
                await dropping;
                await target.raw('DROP INDEX IF EXISTS ??', [index]);
            }
        },
        600000,
    );
});
