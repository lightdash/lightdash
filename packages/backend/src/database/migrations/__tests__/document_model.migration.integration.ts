import { SEED_ORG_1_ADMIN, SEED_PROJECT } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { CreateDocument, DocumentModel } from '../../../models/DocumentModel';
import {
    DocumentsTableName,
    DocumentVersionsTableName,
} from '../../entities/documents';
import { up } from '../20260915170000_create_documents';

describe('DocumentModel PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: DocumentModel;
    let input: CreateDocument;

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

    afterAll(async () => {
        await database.destroy();
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        const schema = `document_model_test_${randomUUID().replaceAll('-', '')}`;
        await transaction.schema.createSchema(schema);
        await transaction.raw('SET LOCAL search_path TO ??, public', [schema]);
        await transaction.raw(`
            CREATE TABLE organizations (organization_id integer PRIMARY KEY, organization_uuid uuid NOT NULL);
            CREATE TABLE projects (project_id integer PRIMARY KEY, project_uuid uuid UNIQUE NOT NULL, organization_id integer NOT NULL);
            CREATE TABLE spaces (space_id integer PRIMARY KEY, space_uuid uuid NOT NULL, project_id integer NOT NULL, deleted_at timestamptz, deleted_by_user_uuid uuid);
            CREATE TABLE users (user_uuid uuid PRIMARY KEY DEFAULT uuid_generate_v4(), first_name text, last_name text, is_marketing_opted_in boolean, is_tracking_anonymized boolean, is_setup_complete boolean, is_active boolean);
        `);
        await transaction.raw('INSERT INTO organizations VALUES (1, ?)', [
            randomUUID(),
        ]);
        await transaction.raw('INSERT INTO projects VALUES (1, ?, 1)', [
            SEED_PROJECT.project_uuid,
        ]);
        await transaction.raw(
            'INSERT INTO spaces (space_id, space_uuid, project_id) VALUES (1, ?, 1)',
            [randomUUID()],
        );
        await transaction.raw('INSERT INTO users (user_uuid) VALUES (?)', [
            SEED_ORG_1_ADMIN.user_uuid,
        ]);
        await up(transaction);
        model = new DocumentModel({ database: transaction });
        const space = await transaction('spaces')
            .join('projects', 'projects.project_id', 'spaces.project_id')
            .where('projects.project_uuid', SEED_PROJECT.project_uuid)
            .whereNull('spaces.deleted_at')
            .first('spaces.space_uuid');
        if (!space) {
            throw new Error('Seed space missing');
        }
        input = {
            projectUuid: SEED_PROJECT.project_uuid,
            spaceUuid: space.space_uuid,
            name: `Document ${randomUUID()}`,
            description: 'A durable report',
            content: {
                cells: [
                    {
                        id: 'introduction',
                        type: 'markdown',
                        content: {
                            markdown: '# Report',
                        },
                    },
                ],
            },
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        };
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    test('creates identity and first immutable version together', async () => {
        const document = await model.create(input);
        expect(document.version).toMatchObject({
            versionNumber: 1,
            schemaVersion: 3,
            content: input.content,
        });
        expect(
            await transaction(DocumentVersionsTableName)
                .where('document_version_uuid', document.version.versionUuid)
                .first(),
        ).toMatchObject({ schema_version: 3, content: input.content });
        expect(
            await model.get(input.projectUuid, document.documentUuid),
        ).toEqual(document);
        expect(
            (
                await model.list(input.projectUuid, {
                    spaceUuids: [input.spaceUuid],
                    limit: 100,
                    offset: 0,
                })
            ).map((item) => item.documentUuid),
        ).toContain(document.documentUuid);
    });

    test('upcasts legacy content without rewriting the immutable stored version', async () => {
        const document = await model.create(input);
        const legacyContent = {
            cells: [
                {
                    id: 'legacy',
                    type: 'markdown',
                    content: '# Original report',
                },
            ],
        };
        await transaction.raw(
            'UPDATE ?? SET schema_version = 1, content = ?::jsonb WHERE document_version_uuid = ?',
            [
                DocumentVersionsTableName,
                JSON.stringify(legacyContent),
                document.version.versionUuid,
            ],
        );

        const result = await model.get(
            input.projectUuid,
            document.documentUuid,
        );
        expect(result.version).toMatchObject({
            versionUuid: document.version.versionUuid,
            versionNumber: 1,
            schemaVersion: 3,
            content: {
                cells: [
                    {
                        id: 'legacy',
                        type: 'markdown',
                        content: { markdown: '# Original report' },
                    },
                ],
            },
        });
        expect(
            await transaction(DocumentVersionsTableName)
                .where('document_version_uuid', document.version.versionUuid)
                .first(),
        ).toMatchObject({ schema_version: 1, content: legacyContent });
    });

    test('reads titled V2 as V3 without changing the stored version or markdown', async () => {
        const document = await model.create(input);
        const legacyContent = {
            cells: [
                {
                    id: 'legacy',
                    type: 'markdown',
                    content: {
                        title: 'Retired heading',
                        markdown: '# Original report',
                    },
                },
            ],
        };
        await transaction.raw(
            'UPDATE ?? SET schema_version = 2, content = ?::jsonb WHERE document_version_uuid = ?',
            [
                DocumentVersionsTableName,
                JSON.stringify(legacyContent),
                document.version.versionUuid,
            ],
        );
        const before = await transaction(DocumentVersionsTableName)
            .where('document_version_uuid', document.version.versionUuid)
            .first();
        const result = await model.get(
            input.projectUuid,
            document.documentUuid,
        );
        expect(result.version).toMatchObject({
            versionUuid: document.version.versionUuid,
            versionNumber: 1,
            schemaVersion: 3,
            content: {
                cells: [
                    {
                        id: 'legacy',
                        type: 'markdown',
                        content: { markdown: '# Original report' },
                    },
                ],
            },
        });
        expect(
            await transaction(DocumentVersionsTableName)
                .where('document_version_uuid', document.version.versionUuid)
                .first(),
        ).toEqual(before);
    });

    test('reads the greatest version number rather than creation time', async () => {
        const document = await model.create(input);
        const row = await transaction(DocumentsTableName)
            .where('document_uuid', document.documentUuid)
            .first();
        if (!row) {
            throw new Error('Document missing');
        }
        await transaction(DocumentVersionsTableName).insert({
            document_id: row.document_id,
            version_number: 2,
            schema_version: 1,
            content: { cells: [] },
            created_by_user_uuid: null,
        });
        const latest = await model.get(
            input.projectUuid,
            document.documentUuid,
        );
        expect(latest.version.versionNumber).toBe(2);
        expect(latest.version.content).toEqual({ cells: [] });
    });

    test('rejects cross-project identity and destination lookups', async () => {
        const document = await model.create(input);
        await expect(
            model.get(randomUUID(), document.documentUuid),
        ).rejects.toThrow('Document not found');
        await expect(
            model.create({ ...input, projectUuid: randomUUID() }),
        ).rejects.toThrow('Space not found');
    });

    test('hides deleted documents and reserves their slugs', async () => {
        const document = await model.create(input);
        await transaction(DocumentsTableName)
            .where('document_uuid', document.documentUuid)
            .update({ deleted_at: new Date() });
        await expect(
            model.get(input.projectUuid, document.documentUuid),
        ).rejects.toThrow('Document not found');
        expect(
            (
                await model.list(input.projectUuid, {
                    spaceUuids: [input.spaceUuid],
                    limit: 100,
                    offset: 0,
                })
            ).map((item) => item.documentUuid),
        ).not.toContain(document.documentUuid);
        const replacement = await model.create(input);
        expect(replacement.slug).toBe(`${document.slug}-1`);
        await expect(
            model.create({ ...input, slug: document.slug }),
        ).rejects.toThrow('already exists');
    });

    test('hides documents whose Space is deleted and refuses new content there', async () => {
        const document = await model.create(input);
        await transaction('spaces')
            .where('space_uuid', input.spaceUuid)
            .update({ deleted_at: new Date(), deleted_by_user_uuid: null });
        await expect(
            model.get(input.projectUuid, document.documentUuid),
        ).rejects.toThrow('Document not found');
        expect(
            (
                await model.list(input.projectUuid, {
                    spaceUuids: [input.spaceUuid],
                    limit: 100,
                    offset: 0,
                })
            ).map((item) => item.documentUuid),
        ).not.toContain(document.documentUuid);
        await expect(model.create(input)).rejects.toThrow('Space not found');
    });

    test('rejects invalid cells before creating identity or version rows', async () => {
        await expect(
            model.create({
                ...input,
                content: {
                    cells: [
                        {
                            id: 'same',
                            type: 'markdown',
                            content: { markdown: 'one' },
                        },
                        {
                            id: 'same',
                            type: 'markdown',
                            content: { markdown: 'two' },
                        },
                    ],
                },
            }),
        ).rejects.toThrow();
        expect(
            await transaction(DocumentsTableName).where('name', input.name),
        ).toHaveLength(0);
    });

    test('validates persisted schema and content at the read boundary', async () => {
        const document = await model.create(input);
        const row = await transaction(DocumentsTableName)
            .where('document_uuid', document.documentUuid)
            .first();
        if (!row) {
            throw new Error('Document missing');
        }
        await transaction(DocumentVersionsTableName).insert({
            document_id: row.document_id,
            version_number: 2,
            schema_version: 99,
            content: { cells: [] },
            created_by_user_uuid: null,
        });
        await expect(
            model.get(input.projectUuid, document.documentUuid),
        ).rejects.toThrow();
    });

    test('deleting an author preserves identity and versions', async () => {
        const [author] = await transaction('users')
            .insert({
                first_name: 'Document',
                last_name: 'Author',
                is_marketing_opted_in: false,
                is_tracking_anonymized: false,
                is_setup_complete: true,
                is_active: true,
            })
            .returning('user_uuid');
        const document = await model.create({
            ...input,
            createdByUserUuid: author.user_uuid,
        });
        await transaction('users')
            .where('user_uuid', author.user_uuid)
            .delete();
        const preserved = await model.get(
            input.projectUuid,
            document.documentUuid,
        );
        expect(preserved.createdByUserUuid).toBeNull();
        expect(preserved.version.createdByUserUuid).toBeNull();
    });

    test('permanent identity deletion cascades to versions', async () => {
        const document = await model.create(input);
        await transaction(DocumentsTableName)
            .where('document_uuid', document.documentUuid)
            .delete();
        expect(
            await transaction(DocumentVersionsTableName).where(
                'document_version_uuid',
                document.version.versionUuid,
            ),
        ).toHaveLength(0);
    });

    test('failed persistence rolls back the entire document creation', async () => {
        await expect(
            model.create({ ...input, createdByUserUuid: randomUUID() }),
        ).rejects.toMatchObject({ code: '23503' });
        expect(
            await transaction(DocumentsTableName).where('name', input.name),
        ).toHaveLength(0);
        expect(await transaction(DocumentVersionsTableName)).toHaveLength(0);
    });

    test('pages deterministically within authorized Spaces', async () => {
        const first = await model.create(input);
        const second = await model.create(input);
        const third = await model.create(input);
        const expected = [first, second, third].sort((left, right) =>
            left.documentUuid.localeCompare(right.documentUuid),
        );
        const options = { spaceUuids: [input.spaceUuid], limit: 2, offset: 0 };
        expect(
            (await model.list(input.projectUuid, options)).map(
                (document) => document.documentUuid,
            ),
        ).toEqual(
            expected.slice(0, 2).map((document) => document.documentUuid),
        );
        expect(
            (
                await model.list(input.projectUuid, { ...options, offset: 2 })
            ).map((document) => document.documentUuid),
        ).toEqual(expected.slice(2).map((document) => document.documentUuid));
        expect(
            await model.list(input.projectUuid, { ...options, offset: 3 }),
        ).toEqual([]);
        expect(
            await model.list(input.projectUuid, { ...options, spaceUuids: [] }),
        ).toEqual([]);
        expect(
            await model.list(input.projectUuid, {
                ...options,
                spaceUuids: [randomUUID()],
            }),
        ).toEqual([]);
    });

    test('lists distinct active owning Spaces scoped to the project', async () => {
        const first = await model.create(input);
        const second = await model.create(input);
        expect(await model.listSpaceUuids(input.projectUuid)).toEqual([
            input.spaceUuid,
        ]);
        expect(await model.listSpaceUuids(randomUUID())).toEqual([]);
        await transaction(DocumentsTableName)
            .whereIn('document_uuid', [first.documentUuid, second.documentUuid])
            .update({ deleted_at: new Date() });
        expect(await model.listSpaceUuids(input.projectUuid)).toEqual([]);
        await model.create(input);
        await transaction('spaces')
            .where('space_uuid', input.spaceUuid)
            .update({ deleted_at: new Date(), deleted_by_user_uuid: null });
        expect(await model.listSpaceUuids(input.projectUuid)).toEqual([]);
    });

    test('database uniqueness rejects duplicate version numbers', async () => {
        const document = await model.create(input);
        const row = await transaction(DocumentsTableName)
            .where('document_uuid', document.documentUuid)
            .first();
        if (!row) {
            throw new Error('Document missing');
        }
        await expect(
            transaction.transaction(async (savepoint) => {
                await savepoint(DocumentVersionsTableName).insert({
                    document_id: row.document_id,
                    version_number: 1,
                    schema_version: 1,
                    content: input.content,
                    created_by_user_uuid: null,
                });
            }),
        ).rejects.toMatchObject({ code: '23505' });
        expect(
            (await model.get(input.projectUuid, document.documentUuid)).version
                .versionNumber,
        ).toBe(1);
    });
});
