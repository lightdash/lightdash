import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { down, up } from '../20260915170000_create_documents';

describe('Document persistence migration on PostgreSQL', () => {
    let database: Knex;
    let transaction: Knex.Transaction;

    beforeAll(() => {
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
        transaction = await database.transaction();
        const schema = `documents_test_${randomUUID().replaceAll('-', '')}`;
        await transaction.schema.createSchema(schema);
        await transaction.raw('SET LOCAL search_path TO ??, public', [schema]);
        await transaction.schema.createTable('projects', (table) => {
            table.uuid('project_uuid').primary();
        });
        await transaction.schema.createTable('spaces', (table) => {
            table.integer('space_id').primary();
        });
        await transaction.schema.createTable('users', (table) => {
            table.uuid('user_uuid').primary();
        });
        await up(transaction);
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    afterAll(async () => {
        await database.destroy();
    });

    test('up and down create and remove both tables', async () => {
        expect(await transaction.schema.hasTable('documents')).toBe(true);
        expect(await transaction.schema.hasTable('document_versions')).toBe(
            true,
        );
        await down(transaction);
        expect(await transaction.schema.hasTable('documents')).toBe(false);
        expect(await transaction.schema.hasTable('document_versions')).toBe(
            false,
        );
        await up(transaction);
        expect(await transaction.schema.hasTable('documents')).toBe(true);
    });

    test('project deletion cascades to identities and their versions', async () => {
        const projectUuid = randomUUID();
        await transaction<{ project_uuid: string }>('projects').insert({
            project_uuid: projectUuid,
        });
        await transaction<{ space_id: number }>('spaces').insert({
            space_id: 1,
        });
        const [document] = await transaction('documents')
            .insert({
                project_uuid: projectUuid,
                space_id: 1,
                slug: 'report',
                name: 'Report',
                description: '',
                created_by_user_uuid: null,
            })
            .returning('document_id');
        await transaction('document_versions').insert({
            document_id: document.document_id,
            version_number: 1,
            schema_version: 1,
            content: { cells: [] },
            created_by_user_uuid: null,
        });
        await transaction('projects')
            .where('project_uuid', projectUuid)
            .delete();
        expect(await transaction('documents')).toHaveLength(0);
        expect(await transaction('document_versions')).toHaveLength(0);
    });

    test('every foreign key is covered by a leading index and tables have primary keys', async () => {
        const result = await transaction.raw<{ rows: { missing: string }[] }>(`
            SELECT con.conname AS missing FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace ns ON ns.oid = rel.relnamespace
            WHERE ns.nspname = current_schema() AND con.contype = 'f'
            AND rel.relname IN ('documents', 'document_versions')
            AND NOT EXISTS (SELECT 1 FROM pg_index idx
                WHERE idx.indrelid = con.conrelid AND idx.indisvalid
                AND idx.indkey[0] = con.conkey[1])
        `);
        expect(result.rows).toEqual([]);
        const primaryKeys = await transaction.raw<{
            rows: { count: string }[];
        }>(`
            SELECT count(*) FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace ns ON ns.oid = rel.relnamespace
            WHERE ns.nspname = current_schema() AND con.contype = 'p'
            AND rel.relname IN ('documents', 'document_versions')
        `);
        expect(primaryKeys.rows[0].count).toBe('2');
    });
});
