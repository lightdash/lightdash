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
                            title: 'Introduction',
                            markdown: '# Report',
                        },
                    },
                ],
            },
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        };
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    test('content updates append exactly one immutable version', async () => {
        const document = await model.create(input);
        const updated = await model.updateContent(
            input.projectUuid,
            document.documentUuid,
            {
                baseVersionUuid: document.version.versionUuid,
                operations: [
                    {
                        type: 'append',
                        cell: {
                            id: 'conclusion',
                            type: 'markdown',
                            content: 'Done',
                        },
                    },
                ],
            },
            SEED_ORG_1_ADMIN.user_uuid,
        );
        expect(updated.version.versionNumber).toBe(2);
        expect(updated.version.versionUuid).not.toBe(
            document.version.versionUuid,
        );
        expect(updated.version.content.cells.map((cell) => cell.id)).toEqual([
            'introduction',
            'conclusion',
        ]);
        expect(updated.version.createdByUserUuid).toBe(
            SEED_ORG_1_ADMIN.user_uuid,
        );
        const versions = await transaction(DocumentVersionsTableName).orderBy(
            'version_number',
        );
        expect(versions).toHaveLength(2);
        expect(versions[0].content).toEqual(input.content);
    });

    test('invalid later operations roll back every operation and version write', async () => {
        const document = await model.create(input);
        await expect(
            model.updateContent(
                input.projectUuid,
                document.documentUuid,
                {
                    baseVersionUuid: document.version.versionUuid,
                    operations: [
                        {
                            type: 'append',
                            cell: {
                                id: 'conclusion',
                                type: 'markdown',
                                content: 'Done',
                            },
                        },
                        { type: 'remove', cellId: 'missing' },
                    ],
                },
                SEED_ORG_1_ADMIN.user_uuid,
            ),
        ).rejects.toThrow();
        expect(
            await model.get(input.projectUuid, document.documentUuid),
        ).toEqual(document);
        expect(await transaction(DocumentVersionsTableName)).toHaveLength(1);
    });

    test('stale content edits conflict without changing the current version', async () => {
        const document = await model.create(input);
        await expect(
            model.updateContent(
                input.projectUuid,
                document.documentUuid,
                {
                    baseVersionUuid: randomUUID(),
                    operations: [{ type: 'remove', cellId: 'introduction' }],
                },
                SEED_ORG_1_ADMIN.user_uuid,
            ),
        ).rejects.toThrow('Document has changed');
        expect(
            await model.get(input.projectUuid, document.documentUuid),
        ).toEqual(document);
    });

    test('metadata updates preserve the immutable content version', async () => {
        const document = await model.create(input);
        const updated = await model.updateMetadata(
            input.projectUuid,
            document.documentUuid,
            {
                name: 'Renamed',
                description: 'New description',
                slug: 'renamed',
            },
        );
        expect(updated).toMatchObject({
            name: 'Renamed',
            description: 'New description',
            slug: 'renamed',
            version: document.version,
        });
        expect(await transaction(DocumentVersionsTableName)).toHaveLength(1);
        expect(
            (
                await model.updateMetadata(
                    input.projectUuid,
                    document.documentUuid,
                    { name: 'Renamed again' },
                )
            ).slug,
        ).toBe('renamed');
    });

    test('metadata cannot claim another document slug even after soft deletion', async () => {
        const document = await model.create(input);
        const other = await model.create(input);
        await transaction(DocumentsTableName)
            .where('document_uuid', other.documentUuid)
            .update({ deleted_at: new Date() });
        await expect(
            model.updateMetadata(input.projectUuid, document.documentUuid, {
                name: 'Not saved',
                slug: other.slug,
            }),
        ).rejects.toThrow('already exists');
        expect(
            await model.get(input.projectUuid, document.documentUuid),
        ).toEqual(document);
        expect(
            (
                await model.updateMetadata(
                    input.projectUuid,
                    document.documentUuid,
                    { slug: document.slug },
                )
            ).slug,
        ).toBe(document.slug);
    });

    test.each(['foreign-project', 'deleted-document', 'deleted-space'])(
        'mutations reject %s',
        async (scenario) => {
            const document = await model.create(input);
            const projectUuid =
                scenario === 'foreign-project'
                    ? randomUUID()
                    : input.projectUuid;
            if (scenario === 'deleted-document') {
                await transaction(DocumentsTableName)
                    .where('document_uuid', document.documentUuid)
                    .update({ deleted_at: new Date() });
            }
            if (scenario === 'deleted-space') {
                await transaction('spaces')
                    .where('space_uuid', input.spaceUuid)
                    .update({
                        deleted_at: new Date(),
                        deleted_by_user_uuid: null,
                    });
            }
            await expect(
                model.updateMetadata(projectUuid, document.documentUuid, {
                    name: 'Not saved',
                }),
            ).rejects.toThrow('Document not found');
            await expect(
                model.updateContent(
                    projectUuid,
                    document.documentUuid,
                    {
                        baseVersionUuid: document.version.versionUuid,
                        operations: [
                            { type: 'remove', cellId: 'introduction' },
                        ],
                    },
                    SEED_ORG_1_ADMIN.user_uuid,
                ),
            ).rejects.toThrow('Document not found');
            expect(await transaction(DocumentVersionsTableName)).toHaveLength(
                1,
            );
        },
    );

    test('two connections racing from the same base commit one version and return one conflict', async () => {
        const schemaResult = await transaction.raw<{
            rows: { schema: string }[];
        }>('SELECT current_schema() AS schema');
        const { schema } = schemaResult.rows[0];
        const document = await model.create(input);
        await transaction.commit();
        const firstConnection = knex({
            ...database.client.config,
            searchPath: [schema, 'public'],
            pool: { min: 0, max: 1 },
        });
        const secondConnection = knex({
            ...database.client.config,
            searchPath: [schema, 'public'],
            pool: { min: 0, max: 1 },
        });
        try {
            const [firstPid, secondPid] = await Promise.all([
                firstConnection.raw<{ rows: { pid: number }[] }>(
                    'SELECT pg_backend_pid() AS pid',
                ),
                secondConnection.raw<{ rows: { pid: number }[] }>(
                    'SELECT pg_backend_pid() AS pid',
                ),
            ]);
            expect(firstPid.rows[0].pid).not.toBe(secondPid.rows[0].pid);
            const firstModel = new DocumentModel({ database: firstConnection });
            const secondModel = new DocumentModel({
                database: secondConnection,
            });
            const blocker = await database.transaction();
            await blocker(DocumentsTableName)
                .withSchema(schema)
                .where('document_uuid', document.documentUuid)
                .forUpdate()
                .first();
            const pendingOutcomes = Promise.allSettled(
                [firstModel, secondModel].map((writer, index) =>
                    writer.updateContent(
                        input.projectUuid,
                        document.documentUuid,
                        {
                            baseVersionUuid: document.version.versionUuid,
                            operations: [
                                {
                                    type: 'append',
                                    cell: {
                                        id: `writer-${index}`,
                                        type: 'markdown',
                                        content: `Writer ${index}`,
                                    },
                                },
                            ],
                        },
                        SEED_ORG_1_ADMIN.user_uuid,
                    ),
                ),
            );
            try {
                const deadline = Date.now() + 5000;
                const waitForBothWriters = async (): Promise<void> => {
                    const waiting = await database.raw<{
                        rows: { count: string }[];
                    }>(
                        "SELECT count(*) FROM pg_stat_activity WHERE pid IN (?, ?) AND wait_event_type = 'Lock'",
                        [firstPid.rows[0].pid, secondPid.rows[0].pid],
                    );
                    if (waiting.rows[0].count === '2') {
                        return;
                    }
                    if (Date.now() > deadline) {
                        throw new Error(
                            'Both Document writers did not reach the row lock',
                        );
                    }
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, 10);
                    });
                    await waitForBothWriters();
                };
                await waitForBothWriters();
            } finally {
                await blocker.rollback();
            }
            const outcomes = await pendingOutcomes;
            expect(
                outcomes.filter((outcome) => outcome.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(
                outcomes.filter((outcome) => outcome.status === 'rejected'),
            ).toHaveLength(1);
            const rejected = outcomes.find(
                (outcome) => outcome.status === 'rejected',
            );
            expect(
                rejected?.status === 'rejected'
                    ? rejected.reason.message
                    : null,
            ).toContain('Document has changed');
            const persisted = await firstModel.get(
                input.projectUuid,
                document.documentUuid,
            );
            expect(persisted.version.versionNumber).toBe(2);
            expect(persisted.version.content.cells).toHaveLength(2);
            const versions = await firstConnection(
                DocumentVersionsTableName,
            ).orderBy('version_number');
            expect(versions).toHaveLength(2);
            expect(versions[0].content).toEqual(input.content);
        } finally {
            await Promise.all([
                firstConnection.destroy(),
                secondConnection.destroy(),
            ]);
            await database.raw('DROP SCHEMA ?? CASCADE', [schema]);
        }
    });

    test('creates identity and first immutable version together', async () => {
        const document = await model.create(input);
        expect(document.version).toMatchObject({
            versionNumber: 1,
            schemaVersion: 2,
            content: input.content,
        });
        expect(
            await transaction(DocumentVersionsTableName)
                .where('document_version_uuid', document.version.versionUuid)
                .first(),
        ).toMatchObject({ schema_version: 2, content: input.content });
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
            schemaVersion: 2,
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
