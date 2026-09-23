import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    down,
    up,
} from '../20260923100700_scope_project_artifacts_to_connections';

type ProjectRow = { project_id: number; project_uuid: string };
type ProjectsTable = Knex.CompositeTableType<
    ProjectRow,
    Omit<ProjectRow, 'project_id'>
>;
type ConnectionRow = {
    warehouse_credentials_id: number;
    warehouse_credentials_uuid: string;
};
type ConnectionsTable = Knex.CompositeTableType<
    ConnectionRow,
    Omit<ConnectionRow, 'warehouse_credentials_id'>
>;
type CatalogRow = { project_uuid: string; warehouse: object };
type CatalogTable = Knex.CompositeTableType<CatalogRow>;
type ManifestRow = {
    project_uuid: string;
    manifest: Buffer;
    created_at: Date;
};
type ManifestsTable = Knex.CompositeTableType<
    ManifestRow,
    Omit<ManifestRow, 'created_at'> & Partial<Pick<ManifestRow, 'created_at'>>
>;
type StagingRow = {
    cached_explore_uuid: string;
    project_uuid: string;
    connection_uuid?: string | null;
};
type StagingTable = Knex.CompositeTableType<StagingRow>;

describe('connection-scoped project artifact migration', () => {
    let admin: Knex;
    let database: Knex;
    let schema: string;

    const projectUuid = randomUUID();
    const firstConnectionUuid = randomUUID();
    const secondConnectionUuid = randomUUID();

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
        schema = `artifact_scope_${randomUUID().replaceAll('-', '')}`;
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
            searchPath: [schema],
            pool: { min: 1, max: 1 },
        });

        await database.schema.createTable('projects', (table) => {
            table.increments('project_id').primary();
            table.uuid('project_uuid').notNullable().unique();
        });
        await database.schema.createTable('warehouse_credentials', (table) => {
            table.increments('warehouse_credentials_id').primary();
            table.uuid('warehouse_credentials_uuid').notNullable().unique();
        });
        await database.schema.createTable('cached_warehouse', (table) => {
            table
                .uuid('project_uuid')
                .primary()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            table.jsonb('warehouse').notNullable();
        });
        await database.schema.createTable(
            'project_merged_manifests',
            (table) => {
                table
                    .uuid('project_uuid')
                    .primary()
                    .references('project_uuid')
                    .inTable('projects')
                    .onDelete('CASCADE');
                table.binary('manifest').notNullable();
                table
                    .timestamp('created_at')
                    .notNullable()
                    .defaultTo(database.fn.now());
            },
        );
        await database.schema.createTable('cached_explore_staging', (table) => {
            table.uuid('cached_explore_uuid').primary();
            table.uuid('project_uuid').notNullable();
        });
        await database<ProjectsTable>('projects').insert({
            project_uuid: projectUuid,
        });
        await database<ConnectionsTable>('warehouse_credentials').insert([
            { warehouse_credentials_uuid: firstConnectionUuid },
            { warehouse_credentials_uuid: secondConnectionUuid },
        ]);
        await database<CatalogTable>('cached_warehouse').insert({
            project_uuid: projectUuid,
            warehouse: { legacy: true },
        });
        await database<ManifestsTable>('project_merged_manifests').insert({
            project_uuid: projectUuid,
            manifest: Buffer.from('legacy'),
        });
    });

    afterAll(async () => {
        if (database) await database.destroy();
        if (admin && schema) await admin.schema.dropSchema(schema, true);
        if (admin) await admin.destroy();
    });

    const getPrimaryKeyColumns = async (table: string): Promise<string[]> => {
        const result = await database.raw<{ rows: { column_name: string }[] }>(
            `SELECT attribute.attname AS column_name
             FROM pg_constraint constraint_row
             JOIN unnest(constraint_row.conkey) WITH ORDINALITY AS key_columns(attnum, ordinal)
               ON true
             JOIN pg_attribute attribute
               ON attribute.attrelid = constraint_row.conrelid
              AND attribute.attnum = key_columns.attnum
             WHERE constraint_row.conrelid = to_regclass(?)
               AND constraint_row.contype = 'p'
             ORDER BY key_columns.ordinal`,
            [table],
        );
        return result.rows.map(({ column_name: columnName }) => columnName);
    };

    const getPublicTableOids = async (): Promise<
        { table_name: string; table_oid: string }[]
    > => {
        const result = await admin.raw<{
            rows: { table_name: string; table_oid: string }[];
        }>(
            `SELECT table_class.relname AS table_name,
                    table_class.oid::text AS table_oid
             FROM pg_class table_class
             JOIN pg_namespace table_namespace
               ON table_namespace.oid = table_class.relnamespace
             WHERE table_namespace.nspname = 'public'
               AND table_class.relname IN (
                   'cached_explore_staging',
                   'project_connection_catalog_cache',
                   'project_connection_manifests'
               )
             ORDER BY table_class.relname`,
        );
        return result.rows;
    };

    test('adds scoped tables without changing legacy contracts', async () => {
        const publicTableOidsBefore = await getPublicTableOids();

        await expect(
            database.schema.hasColumn(
                'cached_explore_staging',
                'connection_uuid',
            ),
        ).resolves.toBe(false);

        await up(database);
        await up(database);

        await expect(
            database.schema.hasColumn(
                'cached_explore_staging',
                'connection_uuid',
            ),
        ).resolves.toBe(true);
        await expect(
            database('information_schema.columns')
                .select('data_type', 'is_nullable')
                .where({
                    table_schema: schema,
                    table_name: 'cached_explore_staging',
                    column_name: 'connection_uuid',
                })
                .first(),
        ).resolves.toEqual({ data_type: 'uuid', is_nullable: 'YES' });
        await database<StagingTable>('cached_explore_staging').insert([
            {
                cached_explore_uuid: randomUUID(),
                project_uuid: projectUuid,
                connection_uuid: firstConnectionUuid,
            },
            {
                cached_explore_uuid: randomUUID(),
                project_uuid: projectUuid,
                connection_uuid: null,
            },
        ]);

        await expect(getPrimaryKeyColumns('cached_warehouse')).resolves.toEqual(
            ['project_uuid'],
        );
        await expect(
            getPrimaryKeyColumns('project_merged_manifests'),
        ).resolves.toEqual(['project_uuid']);
        await expect(
            getPrimaryKeyColumns('project_connection_catalog_cache'),
        ).resolves.toEqual(['project_uuid', 'connection_uuid']);
        await expect(
            getPrimaryKeyColumns('project_connection_manifests'),
        ).resolves.toEqual(['project_uuid', 'connection_uuid']);

        const indexes = await database('pg_indexes')
            .select('indexname')
            .where('schemaname', schema)
            .whereIn('tablename', [
                'project_connection_catalog_cache',
                'project_connection_manifests',
            ]);
        expect(indexes.map(({ indexname }) => indexname)).toEqual(
            expect.arrayContaining([
                'project_connection_catalog_cache_connection_uuid_index',
                'project_connection_manifests_connection_uuid_index',
            ]),
        );

        await database('project_connection_catalog_cache').insert([
            {
                project_uuid: projectUuid,
                connection_uuid: firstConnectionUuid,
                warehouse: { connection: 'first' },
            },
            {
                project_uuid: projectUuid,
                connection_uuid: secondConnectionUuid,
                warehouse: { connection: 'second' },
            },
        ]);
        await database('project_connection_manifests').insert([
            {
                project_uuid: projectUuid,
                connection_uuid: firstConnectionUuid,
                manifest: Buffer.from('first'),
            },
            {
                project_uuid: projectUuid,
                connection_uuid: secondConnectionUuid,
                manifest: Buffer.from('second'),
            },
        ]);

        await expect(
            database('project_connection_catalog_cache').insert({
                project_uuid: projectUuid,
                connection_uuid: firstConnectionUuid,
                warehouse: { duplicate: true },
            }),
        ).rejects.toMatchObject({ code: '23505' });
        await expect(
            database('project_connection_manifests').insert({
                project_uuid: projectUuid,
                connection_uuid: randomUUID(),
                manifest: Buffer.from('invalid'),
            }),
        ).rejects.toMatchObject({ code: '23503' });
        await expect(
            database<CatalogTable>('cached_warehouse').first(),
        ).resolves.toMatchObject({
            project_uuid: projectUuid,
            warehouse: { legacy: true },
        });
        await expect(
            database<ManifestsTable>('project_merged_manifests').first(),
        ).resolves.toMatchObject({
            project_uuid: projectUuid,
            manifest: Buffer.from('legacy'),
        });

        await down(database);
        await down(database);

        await expect(
            database.schema.hasTable('project_connection_catalog_cache'),
        ).resolves.toBe(false);
        await expect(
            database.schema.hasTable('project_connection_manifests'),
        ).resolves.toBe(false);
        await expect(
            database.schema.hasColumn(
                'cached_explore_staging',
                'connection_uuid',
            ),
        ).resolves.toBe(false);
        await expect(
            database<StagingTable>('cached_explore_staging').count('*'),
        ).resolves.toEqual([{ count: '2' }]);
        await expect(getPrimaryKeyColumns('cached_warehouse')).resolves.toEqual(
            ['project_uuid'],
        );
        await expect(
            getPrimaryKeyColumns('project_merged_manifests'),
        ).resolves.toEqual(['project_uuid']);
        await expect(
            database<CatalogTable>('cached_warehouse').first(),
        ).resolves.toMatchObject({
            project_uuid: projectUuid,
            warehouse: { legacy: true },
        });

        await up(database);
        await expect(
            database.schema.hasColumn(
                'cached_explore_staging',
                'connection_uuid',
            ),
        ).resolves.toBe(true);
        await expect(getPublicTableOids()).resolves.toEqual(
            publicTableOidsBefore,
        );
    });
});
