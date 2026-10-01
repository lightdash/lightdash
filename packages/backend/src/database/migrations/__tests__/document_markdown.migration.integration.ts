import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { up as createDocuments } from '../20260915170000_create_documents';
import {
    down,
    up,
} from '../20261001120000_store_documents_as_markdown_with_chart_tags';

const chart = (name: string) => ({
    source: 'semantic',
    chart: {
        name,
        tableName: 'orders',
        metricQuery: { exploreName: 'orders' },
        chartConfig: { type: 'table' },
    },
});

const cells = [
    { type: 'markdown', content: { markdown: '# Findings\n\nRevenue grew.' } },
    { type: 'chart', content: chart('Revenue') },
    { type: 'markdown', content: { markdown: '  ' } },
    { type: 'chart', content: chart('Orders') },
    { type: 'markdown', content: { markdown: '> Closing note' } },
];

describe('Document markdown migration on PostgreSQL', () => {
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
        const schema = `document_markdown_test_${randomUUID().replaceAll('-', '')}`;
        await transaction.schema.createSchema(schema);
        await transaction.raw('SET LOCAL search_path TO ??, public', [schema]);
        await transaction.raw(`
            CREATE TABLE projects (project_uuid uuid PRIMARY KEY);
            CREATE TABLE spaces (space_id integer PRIMARY KEY);
            CREATE TABLE users (user_uuid uuid PRIMARY KEY);
        `);
        await createDocuments(transaction);
        const projectUuid = randomUUID();
        await transaction.raw('INSERT INTO projects VALUES (?)', [projectUuid]);
        await transaction.raw('INSERT INTO spaces VALUES (1)');
        const {
            rows: [document],
        } = await transaction.raw<{ rows: { document_id: number }[] }>(
            `INSERT INTO documents (project_uuid, space_id, slug, name, description)
             VALUES (?, 1, 'report', 'Report', '') RETURNING document_id`,
            [projectUuid],
        );
        await transaction.raw(
            `INSERT INTO document_versions (document_id, version_number, schema_version, content)
             VALUES (?, 1, 1, ?::jsonb), (?, 2, 1, ?::jsonb)`,
            [
                document.document_id,
                JSON.stringify({ cells }),
                document.document_id,
                JSON.stringify({ cells: [] }),
            ],
        );
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    afterAll(async () => {
        await database.destroy();
    });

    test('up adds markdown with sequential chart tags and keeps the cells', async () => {
        await up(transaction);
        const versions = await transaction.raw<{
            rows: Array<{
                schema_version: number;
                content: unknown;
                markdown: string;
                chart_data: Record<string, unknown>;
            }>;
        }>(
            'SELECT schema_version, content, markdown, chart_data FROM document_versions ORDER BY version_number',
        );
        expect(versions.rows).toEqual([
            {
                schema_version: 1,
                content: { cells },
                markdown:
                    '# Findings\n\nRevenue grew.\n\n<document-chart id="c1">\n\n<document-chart id="c2">\n\n> Closing note',
                chart_data: { c1: chart('Revenue'), c2: chart('Orders') },
            },
            {
                schema_version: 1,
                content: { cells: [] },
                markdown: '',
                chart_data: {},
            },
        ]);
        const documents = await transaction.raw<{
            rows: { next_chart_number: number }[];
        }>('SELECT next_chart_number FROM documents');
        expect(documents.rows).toEqual([{ next_chart_number: 3 }]);
    });

    test('up leaves content nullable for versions written as markdown', async () => {
        await up(transaction);
        await transaction.raw(
            `INSERT INTO document_versions (document_id, version_number, schema_version, markdown, chart_data)
             SELECT document_id, 3, 2, 'Only text', '{}'::jsonb FROM documents`,
        );
        const { rows } = await transaction.raw<{ rows: { count: string }[] }>(
            'SELECT count(*) FROM document_versions WHERE content IS NULL',
        );
        expect(rows).toEqual([{ count: '1' }]);
    });

    test('down restores cells for markdown-only versions and keeps the rest', async () => {
        await up(transaction);
        await transaction.raw(
            `INSERT INTO document_versions (document_id, version_number, schema_version, markdown, chart_data)
             SELECT document_id, 3, 2, ?, ?::jsonb FROM documents`,
            [
                '# New\n\n<document-chart id="c3">',
                JSON.stringify({ c3: chart('Added') }),
            ],
        );
        await down(transaction);
        const versions = await transaction.raw<{
            rows: Array<{ schema_version: number; content: unknown }>;
        }>(
            'SELECT schema_version, content FROM document_versions ORDER BY version_number',
        );
        expect(versions.rows).toEqual([
            { schema_version: 1, content: { cells } },
            { schema_version: 1, content: { cells: [] } },
            {
                schema_version: 1,
                content: {
                    cells: [
                        { type: 'markdown', content: { markdown: '# New' } },
                        { type: 'chart', content: chart('Added') },
                    ],
                },
            },
        ]);
        expect(
            await transaction.schema.hasColumn('document_versions', 'markdown'),
        ).toBe(false);
        expect(
            await transaction.schema.hasColumn(
                'documents',
                'next_chart_number',
            ),
        ).toBe(false);
    });
});
