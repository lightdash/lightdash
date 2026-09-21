import { SearchItemType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { ContentVerificationModel } from '../../../models/ContentVerificationModel';
import { SearchModel } from '../../../models/SearchModel';
import type { DbDocument } from '../../entities/documents';
import {
    down as migrateDown,
    up as migrateUp,
} from '../20260921130000_add_document_search_vector';

const up = (database: Knex) => database.transaction(migrateUp);
const down = (database: Knex) => database.transaction(migrateDown);

describe('Document search PostgreSQL integration', () => {
    const schema = `document_search_${randomUUID().replaceAll('-', '')}`;
    const projectUuid = randomUUID();
    const spaceUuid = randomUUID();
    const creatorUuid = randomUUID();
    let database: Knex;
    let model: SearchModel;

    const insertDocument = async (overrides: Partial<DbDocument> = {}) => {
        const documentUuid = randomUUID();
        await database.raw(
            'INSERT INTO documents (document_uuid, project_uuid, space_id, slug, name, description, created_by_user_uuid, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                documentUuid,
                overrides.project_uuid ?? projectUuid,
                overrides.space_id ?? 1,
                overrides.slug ?? `report-${documentUuid}`,
                overrides.name ?? 'Revenue report',
                overrides.description ?? 'Quarterly forecast',
                overrides.created_by_user_uuid === undefined
                    ? creatorUuid
                    : overrides.created_by_user_uuid,
                overrides.created_at ?? new Date('2025-01-15T12:00:00Z'),
                overrides.deleted_at ?? null,
            ],
        );
        return documentUuid;
    };

    beforeAll(async () => {
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
            searchPath: [schema, 'public'],
            pool: { min: 0, max: 1 },
        });
        await database.schema.createSchema(schema);
        await database.raw(`
            CREATE TABLE users (user_uuid uuid PRIMARY KEY, first_name text, last_name text);
            CREATE TABLE spaces (space_id integer PRIMARY KEY, space_uuid uuid NOT NULL, deleted_at timestamptz, deleted_by_user_uuid uuid);
            CREATE TABLE documents (
                document_id serial PRIMARY KEY,
                document_uuid uuid UNIQUE NOT NULL,
                project_uuid uuid NOT NULL,
                space_id integer NOT NULL,
                slug text NOT NULL,
                name text NOT NULL,
                description text,
                created_by_user_uuid uuid,
                created_at timestamptz NOT NULL,
                deleted_at timestamptz
            );
            CREATE TABLE document_versions (document_uuid uuid NOT NULL, content jsonb NOT NULL);
        `);
        await database.raw('INSERT INTO users VALUES (?, ?, ?)', [
            creatorUuid,
            'Ada',
            'Lovelace',
        ]);
        await database.raw(
            'INSERT INTO spaces (space_id, space_uuid) VALUES (1, ?)',
            [spaceUuid],
        );
        await up(database);
        model = new SearchModel({
            database,
            contentVerificationModel: new ContentVerificationModel({
                database,
            }),
        });
    });

    afterAll(async () => {
        try {
            await database.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
        } finally {
            await database.destroy();
        }
    });

    beforeEach(async () => {
        await database.raw('TRUNCATE documents, document_versions');
        await database('spaces').whereNot('space_id', 1).delete();
        await database.raw('UPDATE spaces SET deleted_at = NULL');
    });

    it('generates stored metadata, safely reruns, and survives down/up with content intact', async () => {
        await down(database);
        const uuid = await insertDocument();
        await up(database);
        expect(await model.searchDocuments(projectUuid, 'revenue')).toEqual([
            expect.objectContaining({ uuid }),
        ]);
        expect(await model.searchDocuments(projectUuid, 'forecast')).toEqual([
            expect.objectContaining({ uuid }),
        ]);
        await up(database);
        const index = await database.raw<{
            rows: { valid: boolean; method: string }[];
        }>(
            `SELECT i.indisvalid AS valid, am.amname AS method
             FROM pg_index i
             JOIN pg_class c ON c.oid = i.indexrelid
             JOIN pg_am am ON am.oid = c.relam
             WHERE i.indexrelid = to_regclass(?)`,
            [`${schema}.documents_search_vector_idx`],
        );
        expect(index.rows).toEqual([{ valid: true, method: 'gin' }]);
        const column = await database('information_schema.columns')
            .where({
                table_schema: schema,
                table_name: 'documents',
                column_name: 'search_vector',
            })
            .first('is_generated');
        expect(column).toEqual({ is_generated: 'ALWAYS' });
        await down(database);
        expect(
            await database.schema.hasColumn('documents', 'search_vector'),
        ).toBe(false);
        expect(await database('documents').count()).toEqual([{ count: '1' }]);
        await up(database);
        expect(await model.searchDocuments(projectUuid, 'revenue')).toEqual([
            expect.objectContaining({ uuid }),
        ]);
    });

    it('indexes insert and metadata updates without indexing or returning cell contents', async () => {
        const uuid = await insertDocument();
        await database.raw(
            'INSERT INTO document_versions VALUES (?, ?::jsonb)',
            [
                uuid,
                JSON.stringify({
                    cells: [
                        {
                            type: 'markdown',
                            content: { markdown: 'ultraviolet' },
                        },
                    ],
                }),
            ],
        );
        const results = await model.searchDocuments(projectUuid, 'revenue');
        expect(results).toEqual([
            expect.objectContaining({
                uuid,
                name: 'Revenue report',
                description: 'Quarterly forecast',
                projectUuid,
                spaceUuid,
                createdBy: {
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                    userUuid: creatorUuid,
                },
            }),
        ]);
        expect(results[0]).not.toHaveProperty('content');
        expect(await model.searchDocuments(projectUuid, 'ultraviolet')).toEqual(
            [],
        );
        await database('documents')
            .where('document_uuid', uuid)
            .update({ name: 'Retention overview' });
        expect(await model.searchDocuments(projectUuid, 'revenue')).toEqual([]);
        expect(
            await model.searchDocuments(projectUuid, 'retention'),
        ).toHaveLength(1);
        await database('documents')
            .where('document_uuid', uuid)
            .update({ description: 'Customer loyalty' });
        expect(await model.searchDocuments(projectUuid, 'forecast')).toEqual(
            [],
        );
        expect(
            await model.searchDocuments(projectUuid, 'loyalty'),
        ).toHaveLength(1);
    });

    it('excludes other projects, soft-deleted Documents and deleted parent Spaces', async () => {
        const uuid = await insertDocument();
        await insertDocument({ project_uuid: randomUUID() });
        await insertDocument({ deleted_at: new Date() });
        expect(await model.searchDocuments(projectUuid, 'revenue')).toEqual([
            expect.objectContaining({ uuid }),
        ]);
        await database('spaces')
            .where('space_id', 1)
            .update({ deleted_at: new Date(), deleted_by_user_uuid: null });
        expect(await model.searchDocuments(projectUuid, 'revenue')).toEqual([]);
    });

    it('applies Document type, verified, creator and inclusive date filters', async () => {
        const uuid = await insertDocument();
        await insertDocument({ created_by_user_uuid: null });
        await insertDocument({ created_at: new Date('2025-01-16T00:00:00Z') });
        await insertDocument({ created_at: new Date('2025-01-14T23:59:59Z') });
        const filters = {
            type: SearchItemType.DOCUMENT,
            createdByUuid: creatorUuid,
            fromDate: '2025-01-15',
            toDate: '2025-01-15',
        };
        expect(
            await model.searchDocuments(projectUuid, 'revenue', filters),
        ).toEqual([expect.objectContaining({ uuid })]);
        expect(
            await model.searchDocuments(projectUuid, 'revenue', {
                type: SearchItemType.CHART,
            }),
        ).toEqual([]);
        expect(
            await model.searchDocuments(projectUuid, 'revenue', {
                verifiedOnly: true,
            }),
        ).toEqual([]);
        expect(
            await model.searchDocuments(projectUuid, 'revenue', {
                createdByUuid: randomUUID(),
            }),
        ).toEqual([]);
        expect(await model.searchDocuments(projectUuid, 'revenue')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ createdBy: null }),
            ]),
        );
        await expect(
            model.searchDocuments(projectUuid, 'revenue', {
                fromDate: '2025-01-16',
                toDate: '2025-01-15',
            }),
        ).rejects.toThrow('fromDate cannot be after toDate');
    });

    it('applies inherited and direct visibility before the top ten limit', async () => {
        const visibleSpaceUuid = randomUUID();
        await database.raw(
            'INSERT INTO spaces (space_id, space_uuid) VALUES (2, ?)',
            [visibleSpaceUuid],
        );
        await Promise.all(
            Array.from({ length: 12 }, () =>
                insertDocument({ name: 'Revenue', description: '' }),
            ),
        );
        const inherited = await insertDocument({
            space_id: 2,
            name: 'Inherited report',
            description: 'Revenue',
        });
        const direct = await insertDocument({
            name: 'Direct report',
            description: 'Revenue',
        });
        const inheritedResults = await model.searchDocuments(
            projectUuid,
            'revenue',
            undefined,
            {
                spaceUuids: [visibleSpaceUuid],
                documentUuids: [],
            },
        );
        expect(inheritedResults.map(({ uuid }) => uuid)).toEqual([inherited]);
        const directResults = await model.searchDocuments(
            projectUuid,
            'revenue',
            undefined,
            {
                spaceUuids: [],
                documentUuids: [direct],
            },
        );
        expect(directResults.map(({ uuid }) => uuid)).toEqual([direct]);
        const combined = await model.searchDocuments(
            projectUuid,
            'revenue',
            undefined,
            {
                spaceUuids: [visibleSpaceUuid],
                documentUuids: [inherited, direct],
            },
        );
        expect(combined.map(({ uuid }) => uuid).sort()).toEqual(
            [inherited, direct].sort(),
        );
        expect(
            await model.searchDocuments(projectUuid, 'revenue', undefined, {
                spaceUuids: [],
                documentUuids: [],
            }),
        ).toEqual([]);
    });

    it('ranks name matches above descriptions and returns a deterministic top ten', async () => {
        const descriptions = await Promise.all(
            Array.from({ length: 12 }, (_, index) =>
                insertDocument({
                    name: `Report ${index}`,
                    description: 'Revenue',
                }),
            ),
        );
        const exact = await insertDocument({
            name: 'Revenue',
            description: '',
        });
        const results = await model.searchDocuments(projectUuid, 'revenue');
        expect(results).toHaveLength(10);
        expect(results[0].uuid).toBe(exact);
        expect(results.map(({ uuid }) => uuid)).toEqual([
            exact,
            ...descriptions.sort().slice(0, 9),
        ]);
    });
});
