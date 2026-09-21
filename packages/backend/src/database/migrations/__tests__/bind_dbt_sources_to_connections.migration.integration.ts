import { DbtProjectType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    down as expandDown,
    up as expandUp,
} from '../20260918110000_bind_dbt_sources_to_connections';

describe('dbt source connection binding migration', () => {
    let admin: Knex;
    let database: Knex;
    let schema: string;

    const primaryProjectUuid = randomUUID();
    const existingProjectUuid = randomUUID();
    const emptyProjectUuid = randomUUID();
    const primarySourceUuid = randomUUID();
    const existingPrimarySourceUuid = randomUUID();
    const emptySourceUuid = randomUUID();
    const primaryConnectionUuid = randomUUID();
    const existingConnectionUuid = randomUUID();
    const additionalConnectionUuid = randomUUID();
    const thirdConnectionUuid = randomUUID();
    const additionalSourceUuid = randomUUID();

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
        schema = `source_binding_${randomUUID().replaceAll('-', '')}`;
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
            table.binary('dbt_connection').nullable();
            table.text('dbt_connection_type').nullable();
            table.uuid('dbt_source_uuid').nullable();
            table.text('dbt_source_name').notNullable();
        });
        await database.schema.createTable('warehouse_credentials', (table) => {
            table.increments('warehouse_credentials_id').primary();
            table.integer('project_id').notNullable();
            table.uuid('warehouse_credentials_uuid').notNullable().unique();
            table.timestamp('superseded_at').nullable();
        });
        await database.schema.createTable('project_dbt_sources', (table) => {
            table.uuid('project_dbt_source_uuid').primary();
            table.uuid('project_uuid').notNullable();
            table.text('name').notNullable();
            table.boolean('is_primary').notNullable().defaultTo(false);
            table.integer('precedence').notNullable().defaultTo(0);
            table.text('dbt_connection_type').nullable();
            table.binary('dbt_connection').nullable();
            table.text('warehouse_database').nullable();
            table.text('warehouse_schema').nullable();
        });
        await database.schema.createTable('cached_explore', (table) => {
            table.uuid('cached_explore_uuid').primary();
            table.uuid('project_uuid').notNullable();
        });
        await database.schema.createTable('cached_explore_staging', (table) => {
            table.uuid('cached_explore_uuid').primary();
            table.uuid('project_uuid').notNullable();
        });
        await database.schema.createTable('saved_sql', (table) => {
            table.uuid('saved_sql_uuid').primary();
            table.uuid('project_uuid').notNullable();
        });
        await database.schema.createTable('saved_sql_versions', (table) => {
            table.uuid('saved_sql_version_uuid').primary();
            table.uuid('saved_sql_uuid').notNullable();
        });

        const projects = await database<Record<string, unknown>>('projects')
            .insert([
                {
                    project_uuid: primaryProjectUuid,
                    dbt_connection: Buffer.from('primary-ciphertext'),
                    dbt_connection_type: DbtProjectType.GITHUB,
                    dbt_source_uuid: primarySourceUuid,
                    dbt_source_name: 'core',
                },
                {
                    project_uuid: existingProjectUuid,
                    dbt_connection: Buffer.from('existing-ciphertext'),
                    dbt_connection_type: DbtProjectType.GITHUB,
                    dbt_source_uuid: existingPrimarySourceUuid,
                    dbt_source_name: 'existing_core',
                },
                {
                    project_uuid: emptyProjectUuid,
                    dbt_connection: null,
                    dbt_connection_type: null,
                    dbt_source_uuid: emptySourceUuid,
                    dbt_source_name: 'empty',
                },
            ])
            .returning(['project_id', 'project_uuid']);
        const projectIds = Object.fromEntries(
            projects.map(({ project_id: projectId, project_uuid: uuid }) => [
                uuid,
                projectId,
            ]),
        );
        await database<Record<string, unknown>>('warehouse_credentials').insert(
            [
                {
                    project_id: projectIds[primaryProjectUuid],
                    warehouse_credentials_uuid: primaryConnectionUuid,
                },
                {
                    project_id: projectIds[existingProjectUuid],
                    warehouse_credentials_uuid: existingConnectionUuid,
                },
            ],
        );
        await database<Record<string, unknown>>('project_dbt_sources').insert([
            {
                project_dbt_source_uuid: additionalSourceUuid,
                project_uuid: existingProjectUuid,
                name: 'finance',
                is_primary: false,
                precedence: 1,
                dbt_connection_type: DbtProjectType.GITHUB,
                dbt_connection: Buffer.from('finance-ciphertext'),
            },
            {
                project_dbt_source_uuid: emptySourceUuid,
                project_uuid: emptyProjectUuid,
                name: 'unbound',
                is_primary: false,
                precedence: 1,
                dbt_connection_type: DbtProjectType.GITHUB,
                dbt_connection: Buffer.from('unbound-ciphertext'),
            },
        ]);
    });

    afterAll(async () => {
        await database.destroy();
        await admin.schema.dropSchema(schema, true);
        await admin.destroy();
    });

    test('expands nullable bindings and survives repeated up after down for a multi-connection project', async () => {
        await expandUp(database);

        const firstRows = await database('project_dbt_sources')
            .select('*')
            .orderBy('project_uuid')
            .orderBy('precedence');
        expect(firstRows).toHaveLength(4);
        expect(
            firstRows.find(
                ({ project_dbt_source_uuid: uuid }) =>
                    uuid === primarySourceUuid,
            ),
        ).toMatchObject({
            project_uuid: primaryProjectUuid,
            connection_uuid: primaryConnectionUuid,
            namespace_prefix: '',
            name: 'core',
            is_primary: true,
            precedence: 0,
            warehouse_database: null,
            warehouse_schema: null,
        });
        expect(
            firstRows.find(
                ({ project_dbt_source_uuid: uuid }) =>
                    uuid === additionalSourceUuid,
            ),
        ).toMatchObject({
            connection_uuid: existingConnectionUuid,
            namespace_prefix: 'finance',
            is_primary: false,
        });
        expect(
            firstRows.find(
                ({ project_dbt_source_uuid: uuid }) => uuid === emptySourceUuid,
            ),
        ).toMatchObject({
            project_uuid: emptyProjectUuid,
            connection_uuid: null,
            namespace_prefix: 'unbound',
            is_primary: false,
        });
        const [{ is_nullable: isNullable }] = await database(
            'information_schema.columns',
        )
            .select('is_nullable')
            .where({
                table_schema: schema,
                table_name: 'project_dbt_sources',
                column_name: 'connection_uuid',
            });
        expect(isNullable).toBe('YES');

        const [{ project_id: primaryProjectId }] = await database('projects')
            .select('project_id')
            .where('project_uuid', primaryProjectUuid);
        await database<Record<string, unknown>>('warehouse_credentials').insert(
            [
                {
                    project_id: primaryProjectId,
                    warehouse_credentials_uuid: additionalConnectionUuid,
                },
                {
                    project_id: primaryProjectId,
                    warehouse_credentials_uuid: thirdConnectionUuid,
                },
            ],
        );

        await expandDown(database);
        expect(
            await database.schema.hasColumn(
                'project_dbt_sources',
                'connection_uuid',
            ),
        ).toBe(true);
        expect(
            await database('project_dbt_sources')
                .where('project_uuid', primaryProjectUuid)
                .first(),
        ).toMatchObject({
            project_dbt_source_uuid: primarySourceUuid,
            connection_uuid: primaryConnectionUuid,
            namespace_prefix: '',
        });

        await expandUp(database);
        await expandUp(database);
        const secondRows = await database('project_dbt_sources').select('*');
        expect(secondRows).toHaveLength(4);
        expect(
            secondRows.filter(({ is_primary: isPrimary }) => isPrimary),
        ).toHaveLength(2);
    });
});
