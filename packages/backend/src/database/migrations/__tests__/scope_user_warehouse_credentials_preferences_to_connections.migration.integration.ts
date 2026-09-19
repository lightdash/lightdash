import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    down,
    up,
} from '../20260917170000_scope_user_warehouse_credentials_preferences_to_connections';

describe('connection-scoped personal credential preference migration', () => {
    let admin: Knex;
    let database: Knex;
    let schema: string;

    const projectUuid = randomUUID();
    const userUuid = randomUUID();
    const connectionUuid = randomUUID();
    const userWarehouseCredentialsUuid = randomUUID();

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
            table.timestamp('superseded_at').nullable();
        });
        await database.schema.createTable(
            'project_user_warehouse_credentials_preference',
            (table) => {
                table.uuid('user_uuid').notNullable();
                table.uuid('project_uuid').notNullable();
                table.uuid('user_warehouse_credentials_uuid').notNullable();
                table.primary(['user_uuid', 'project_uuid']);
            },
        );

        const [{ project_id: projectId }] = await database<
            Record<string, unknown>
        >('projects')
            .insert({ project_uuid: projectUuid })
            .returning('project_id');
        await database<Record<string, unknown>>('warehouse_credentials').insert(
            {
                warehouse_credentials_uuid: connectionUuid,
                project_id: projectId,
            },
        );
        await database<Record<string, unknown>>(
            'project_user_warehouse_credentials_preference',
        ).insert({
            user_uuid: userUuid,
            project_uuid: projectUuid,
            user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
        });
    });

    afterAll(async () => {
        await database.destroy();
        await admin.schema.dropSchema(schema, true);
        await admin.destroy();
    });

    test('survives repeated up before and after down', async () => {
        await up(database);
        await up(database);

        expect(
            await database(
                'project_user_warehouse_credentials_preference',
            ).first(),
        ).toMatchObject({ connection_uuid: connectionUuid });

        await down(database);
        await up(database);
        await up(database);

        expect(
            await database(
                'project_user_warehouse_credentials_preference',
            ).first(),
        ).toMatchObject({ connection_uuid: connectionUuid });
    });
});
