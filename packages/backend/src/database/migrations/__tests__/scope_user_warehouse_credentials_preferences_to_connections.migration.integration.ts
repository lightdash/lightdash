import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    down,
    up,
} from '../20260923100500_scope_user_warehouse_credentials_preferences_to_connections';

const PREFERENCE_TABLE = 'project_user_warehouse_credentials_preference';

describe('connection-scoped personal credential preference migration', () => {
    let admin: Knex;
    let database: Knex;
    let schema: string;

    const userUuid = randomUUID();
    const singleConnectionProjectUuid = randomUUID();
    const multiConnectionProjectUuid = randomUUID();
    const unconnectedProjectUuid = randomUUID();
    const singleConnectionUuid = randomUUID();
    const originalConnectionUuid = randomUUID();
    const addedConnectionUuid = randomUUID();
    const supersededConnectionUuid = randomUUID();
    const userWarehouseCredentialsUuid = randomUUID();

    const getPrimaryKeyColumns = async (): Promise<string[]> => {
        const result = await database.raw<{
            rows: { column_name: string }[];
        }>(
            `SELECT attribute.attname AS column_name
             FROM pg_index index
             JOIN pg_attribute attribute
                ON attribute.attrelid = index.indrelid
               AND attribute.attnum = ANY(index.indkey)
             WHERE index.indrelid = ?::regclass
               AND index.indisprimary
             ORDER BY array_position(index.indkey, attribute.attnum)`,
            [PREFERENCE_TABLE],
        );
        return result.rows.map((row) => row.column_name);
    };

    const getPreferences = async () =>
        database(PREFERENCE_TABLE)
            .select('project_uuid', 'connection_uuid')
            .orderBy(['project_uuid', 'connection_uuid']);

    const seedPreferences = async () => {
        await database(PREFERENCE_TABLE).delete();
        await database<Record<string, unknown>>(PREFERENCE_TABLE).insert(
            [
                singleConnectionProjectUuid,
                multiConnectionProjectUuid,
                unconnectedProjectUuid,
            ].map((projectUuid) => ({
                user_uuid: userUuid,
                project_uuid: projectUuid,
                user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
            })),
        );
    };

    beforeAll(async () => {
        admin = knex({
            client: 'pg',
            connection: {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
        });
        schema = `credential_preference_${randomUUID().replaceAll('-', '')}`;
        await admin.schema.createSchema(schema);
        database = knex({
            client: 'pg',
            connection: {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
            searchPath: [schema, 'public'],
            pool: { min: 1, max: 1 },
        });

        await database.schema.createTable('projects', (table) => {
            table.increments('project_id').primary();
            table.uuid('project_uuid').notNullable().unique();
        });
        await database.schema.createTable('warehouse_credentials', (table) => {
            table.uuid('warehouse_credentials_uuid').primary();
            table.integer('project_id').notNullable();
            table.timestamp('created_at').notNullable();
            table.timestamp('superseded_at').nullable();
        });
        await database.schema.createTable(PREFERENCE_TABLE, (table) => {
            table.uuid('user_uuid').notNullable();
            table.uuid('project_uuid').notNullable();
            table.uuid('user_warehouse_credentials_uuid').notNullable();
            table.primary(['user_uuid', 'project_uuid']);
        });

        const projectIds = new Map<string, number>();
        for (const projectUuid of [
            singleConnectionProjectUuid,
            multiConnectionProjectUuid,
            unconnectedProjectUuid,
        ]) {
            // eslint-disable-next-line no-await-in-loop
            const [{ project_id: projectId }] = await database<
                Record<string, unknown>
            >('projects')
                .insert({ project_uuid: projectUuid })
                .returning('project_id');
            projectIds.set(projectUuid, projectId as number);
        }
        await database<Record<string, unknown>>('warehouse_credentials').insert(
            [
                {
                    warehouse_credentials_uuid: singleConnectionUuid,
                    project_id: projectIds.get(singleConnectionProjectUuid),
                    created_at: new Date('2026-01-01T00:00:00Z'),
                },
                {
                    warehouse_credentials_uuid: addedConnectionUuid,
                    project_id: projectIds.get(multiConnectionProjectUuid),
                    created_at: new Date('2026-09-18T00:00:00Z'),
                },
                {
                    warehouse_credentials_uuid: originalConnectionUuid,
                    project_id: projectIds.get(multiConnectionProjectUuid),
                    created_at: new Date('2026-01-01T00:00:00Z'),
                },
                {
                    warehouse_credentials_uuid: supersededConnectionUuid,
                    project_id: projectIds.get(unconnectedProjectUuid),
                    created_at: new Date('2026-01-01T00:00:00Z'),
                    superseded_at: new Date('2026-02-01T00:00:00Z'),
                },
            ],
        );
        await seedPreferences();
    });

    afterAll(async () => {
        await database.destroy();
        await admin.schema.dropSchema(schema, true);
        await admin.destroy();
    });

    test('scopes every preference to a live connection and keeps a primary key', async () => {
        await up(database);

        expect(await getPrimaryKeyColumns()).toEqual([
            'user_uuid',
            'project_uuid',
            'connection_uuid',
        ]);
        expect(await getPreferences()).toEqual(
            [
                {
                    project_uuid: singleConnectionProjectUuid,
                    connection_uuid: singleConnectionUuid,
                },
                {
                    project_uuid: multiConnectionProjectUuid,
                    connection_uuid: originalConnectionUuid,
                },
            ].sort((left, right) =>
                left.project_uuid.localeCompare(right.project_uuid),
            ),
        );
    });

    test('keeps one preference per connection for the same user and project', async () => {
        await database(PREFERENCE_TABLE)
            .insert({
                user_uuid: userUuid,
                project_uuid: multiConnectionProjectUuid,
                user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
                connection_uuid: addedConnectionUuid,
            })
            .onConflict(['user_uuid', 'project_uuid', 'connection_uuid'])
            .merge();

        expect(
            await database(PREFERENCE_TABLE)
                .where('project_uuid', multiConnectionProjectUuid)
                .pluck('connection_uuid'),
        ).toHaveLength(2);
        await expect(
            database<Record<string, unknown>>(PREFERENCE_TABLE).insert({
                user_uuid: userUuid,
                project_uuid: singleConnectionProjectUuid,
                user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
            }),
        ).rejects.toThrow();
    });

    test('survives repeated up before and after down', async () => {
        await up(database);
        await up(database);
        await down(database);

        expect(await getPrimaryKeyColumns()).toEqual([
            'user_uuid',
            'project_uuid',
        ]);

        await seedPreferences();
        await up(database);
        await up(database);

        expect(await getPrimaryKeyColumns()).toEqual([
            'user_uuid',
            'project_uuid',
            'connection_uuid',
        ]);
        expect(
            await database(PREFERENCE_TABLE).whereNull('connection_uuid'),
        ).toEqual([]);
    });
});
