import {
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    SpaceMemberRole,
} from '@lightdash/common';
import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { DirectAccessModel } from '../../../models/DirectAccessModel';
import { DocumentAccessModel } from '../../../models/DocumentAccessModel';
import { CreateDocument, DocumentModel } from '../../../models/DocumentModel';
import {
    DocumentsTableName,
    DocumentVersionsTableName,
} from '../../entities/documents';
import { up } from '../20260915170000_create_documents';
import {
    down as grantsDown,
    up as grantsUp,
} from '../20260916100000_create_document_access_tables';
import { up as provenanceUp } from '../20260916110000_add_document_space_deletion_provenance';

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
        await provenanceUp(transaction);
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
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    describe('Document grants and moving', () => {
        let organizationUuid: string;
        let groupUuid: string;
        let accessModel: DocumentAccessModel;
        let grantStore: DirectAccessModel;
        beforeEach(async () => {
            await transaction.raw(`
                ALTER TABLE users ADD COLUMN user_id serial;
                CREATE TABLE groups (group_uuid uuid PRIMARY KEY, organization_id integer, name text);
                CREATE TABLE organization_memberships (user_id integer,organization_id integer,role text,role_uuid uuid);
                CREATE TABLE organization_membership_custom_roles (user_id integer,organization_id integer);
                CREATE TABLE project_memberships (user_id integer,project_id integer);
                CREATE TABLE project_group_access (group_uuid uuid,project_uuid uuid);
                CREATE TABLE group_memberships (group_uuid uuid,user_id integer,organization_id integer);
            `);
            await transaction.raw('UPDATE users SET is_active=true');
            await transaction.raw(
                "INSERT INTO organization_memberships SELECT user_id,1,'viewer',NULL FROM users",
            );
            const org =
                await transaction('organizations').first('organization_uuid');
            if (!org) throw new Error('Missing organization');
            organizationUuid = org.organization_uuid;
            groupUuid = randomUUID();
            await transaction.raw('INSERT INTO groups VALUES (?,1,?)', [
                groupUuid,
                'Report readers',
            ]);
            await transaction.raw(
                'INSERT INTO project_group_access VALUES (?,?)',
                [groupUuid, input.projectUuid],
            );
            await transaction.raw(
                'INSERT INTO group_memberships SELECT ?,user_id,1 FROM users',
                [groupUuid],
            );
            await grantsUp(transaction);
            accessModel = new DocumentAccessModel(transaction);
            grantStore = new DirectAccessModel(transaction);
        });
        const grant = async (
            documentUuid: string,
            type = DirectAccessPrincipalType.USER,
        ) =>
            grantStore.upsertAccess({
                resourceType: DirectAccessResourceType.DOCUMENT,
                resourceUuid: documentUuid,
                organizationUuid,
                principal: {
                    type,
                    uuid:
                        type === DirectAccessPrincipalType.USER
                            ? SEED_ORG_1_ADMIN.user_uuid
                            : groupUuid,
                },
                role:
                    type === DirectAccessPrincipalType.USER
                        ? SpaceMemberRole.VIEWER
                        : SpaceMemberRole.EDITOR,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            });

        test('soft-delete is idempotent, preserves versions/grants and restore recovers the same identity', async () => {
            const document = await model.create(input);
            await grant(document.documentUuid);
            await grant(document.documentUuid, DirectAccessPrincipalType.GROUP);
            await model.softDelete(
                input.projectUuid,
                document.documentUuid,
                SEED_ORG_1_ADMIN.user_uuid,
                input.spaceUuid,
            );
            const deleted = await model.getLifecycleState(
                input.projectUuid,
                document.documentUuid,
            );
            expect(
                await transaction('documents')
                    .where('document_uuid', document.documentUuid)
                    .first('deleted_with_space'),
            ).toEqual({ deleted_with_space: false });
            await model.softDelete(
                input.projectUuid,
                document.documentUuid,
                randomUUID(),
                input.spaceUuid,
            );
            expect(
                await model.getLifecycleState(
                    input.projectUuid,
                    document.documentUuid,
                ),
            ).toEqual(deleted);
            await expect(
                model.get(input.projectUuid, document.documentUuid),
            ).rejects.toThrow('not found');
            expect(await model.listSpaceUuids(input.projectUuid)).toEqual([]);
            expect(
                await accessModel.getUserAccess(
                    [document.documentUuid],
                    SEED_ORG_1_ADMIN.user_uuid,
                    { organizationUuid },
                ),
            ).toEqual({});
            expect(await transaction('document_user_access')).toHaveLength(1);
            expect(await transaction('document_group_access')).toHaveLength(1);
            expect(await transaction(DocumentVersionsTableName)).toHaveLength(
                1,
            );
            await model.restore(input.projectUuid, document.documentUuid);
            expect(
                await transaction('documents')
                    .where('document_uuid', document.documentUuid)
                    .first('deleted_with_space'),
            ).toEqual({ deleted_with_space: false });
            expect(
                await model.get(input.projectUuid, document.documentUuid),
            ).toMatchObject({
                documentUuid: document.documentUuid,
                slug: document.slug,
                version: document.version,
            });
            expect(
                (
                    await accessModel.getUserAccess(
                        [document.documentUuid],
                        SEED_ORG_1_ADMIN.user_uuid,
                        { organizationUuid },
                    )
                )[document.documentUuid],
            ).toMatchObject({
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [SpaceMemberRole.EDITOR],
            });
        });

        test('permanent deletion purges identity, versions and direct grants atomically', async () => {
            const document = await model.create(input);
            await grant(document.documentUuid);
            await grant(document.documentUuid, DirectAccessPrincipalType.GROUP);
            await expect(
                model.permanentDelete(input.projectUuid, document.documentUuid),
            ).rejects.toThrow('not found');
            await model.softDelete(
                input.projectUuid,
                document.documentUuid,
                SEED_ORG_1_ADMIN.user_uuid,
                input.spaceUuid,
            );
            await expect(
                model.permanentDelete(randomUUID(), document.documentUuid),
            ).rejects.toThrow('not found');
            await model.permanentDelete(
                input.projectUuid,
                document.documentUuid,
            );
            expect(await transaction('document_user_access')).toEqual([]);
            expect(await transaction('document_group_access')).toEqual([]);
            expect(await transaction(DocumentVersionsTableName)).toEqual([]);
            await expect(
                model.getLifecycleState(
                    input.projectUuid,
                    document.documentUuid,
                ),
            ).rejects.toThrow('not found');
        });

        test('recovery does not parse version JSON and refuses a deleted parent Space', async () => {
            const document = await model.create(input);
            await model.softDelete(
                input.projectUuid,
                document.documentUuid,
                SEED_ORG_1_ADMIN.user_uuid,
                input.spaceUuid,
            );
            await transaction.raw(
                'UPDATE document_versions SET schema_version=999',
            );
            expect(
                (
                    await model.getLifecycleState(
                        input.projectUuid,
                        document.documentUuid,
                    )
                ).deletedAt,
            ).not.toBeNull();
            await transaction('spaces')
                .where('space_uuid', input.spaceUuid)
                .update({ deleted_at: new Date(), deleted_by_user_uuid: null });
            await expect(
                model.restore(input.projectUuid, document.documentUuid),
            ).rejects.toThrow('Restore the owning Space');
            expect(
                (
                    await model.getLifecycleState(
                        input.projectUuid,
                        document.documentUuid,
                    )
                ).deletedAt,
            ).not.toBeNull();
            await model.permanentDelete(
                input.projectUuid,
                document.documentUuid,
            );
        });

        test('lifecycle refuses stale Space ownership and wrong project without changing rows', async () => {
            const document = await model.create(input);
            await expect(
                model.softDelete(
                    input.projectUuid,
                    document.documentUuid,
                    SEED_ORG_1_ADMIN.user_uuid,
                    randomUUID(),
                ),
            ).rejects.toThrow('has moved');
            await expect(
                model.softDelete(
                    randomUUID(),
                    document.documentUuid,
                    SEED_ORG_1_ADMIN.user_uuid,
                    input.spaceUuid,
                ),
            ).rejects.toThrow('not found');
            await expect(
                model.restore(randomUUID(), document.documentUuid),
            ).rejects.toThrow('not found');
            expect(
                (
                    await model.getLifecycleState(
                        input.projectUuid,
                        document.documentUuid,
                    )
                ).deletedAt,
            ).toBeNull();
            await model.permanentDelete(
                input.projectUuid,
                document.documentUuid,
                { expectedSpaceUuid: input.spaceUuid, requireDeleted: false },
            );
        });

        test('concrete user/group grants combine roles and stay tenant-scoped', async () => {
            const document = await model.create(input);
            await grant(document.documentUuid);
            await grant(document.documentUuid, DirectAccessPrincipalType.GROUP);
            const read = await accessModel.getUserAccess(
                [document.documentUuid],
                SEED_ORG_1_ADMIN.user_uuid,
                { organizationUuid },
            );
            expect(read[document.documentUuid]).toEqual({
                organizationUuid,
                projectUuid: input.projectUuid,
                spaceUuid: input.spaceUuid,
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [SpaceMemberRole.EDITOR],
            });
            expect(
                await accessModel.getUserAccess(
                    [document.documentUuid],
                    SEED_ORG_1_ADMIN.user_uuid,
                    { organizationUuid: randomUUID() },
                ),
            ).toEqual({});
            await expect(
                grantStore.upsertAccess({
                    resourceType: DirectAccessResourceType.DOCUMENT,
                    resourceUuid: document.documentUuid,
                    organizationUuid: randomUUID(),
                    principal: {
                        type: DirectAccessPrincipalType.USER,
                        uuid: SEED_ORG_1_ADMIN.user_uuid,
                    },
                    role: SpaceMemberRole.ADMIN,
                    grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                }),
            ).rejects.toThrow('not found');
        });

        test.each([
            'inactive-user',
            'lost-project',
            'lost-group',
            'deleted-document',
            'deleted-space',
        ])('ignores inert %s grants without deleting rows', async (reason) => {
            const document = await model.create(input);
            await grant(document.documentUuid, DirectAccessPrincipalType.GROUP);
            if (reason === 'inactive-user')
                await transaction.raw('UPDATE users SET is_active=false');
            if (reason === 'lost-project') {
                await transaction.raw(
                    "UPDATE organization_memberships SET role='member'",
                );
                await transaction.raw('DELETE FROM project_group_access');
            }
            if (reason === 'lost-group')
                await transaction.raw('DELETE FROM project_group_access');
            if (reason === 'deleted-document')
                await transaction(DocumentsTableName)
                    .where('document_uuid', document.documentUuid)
                    .update({ deleted_at: new Date() });
            if (reason === 'deleted-space')
                await transaction('spaces')
                    .where('space_uuid', input.spaceUuid)
                    .update({
                        deleted_at: new Date(),
                        deleted_by_user_uuid: null,
                    });
            expect(
                await accessModel.getUserAccess(
                    [document.documentUuid],
                    SEED_ORG_1_ADMIN.user_uuid,
                    { organizationUuid },
                ),
            ).toEqual({});
            expect(await transaction('document_group_access')).toHaveLength(1);
        });

        test('move preserves grants, immutable version and stable identity', async () => {
            const document = await model.create(input);
            await grant(document.documentUuid);
            const targetSpaceUuid = randomUUID();
            await transaction.raw(
                'INSERT INTO spaces (space_id,space_uuid,project_id) VALUES (2,?,1)',
                [targetSpaceUuid],
            );
            const moved = await model.moveToSpace({
                projectUuid: input.projectUuid,
                documentUuid: document.documentUuid,
                sourceSpaceUuid: input.spaceUuid,
                targetSpaceUuid,
            });
            expect(moved).toMatchObject({
                documentUuid: document.documentUuid,
                spaceUuid: targetSpaceUuid,
                slug: document.slug,
                version: document.version,
            });
            expect(
                (
                    await accessModel.getUserAccess(
                        [document.documentUuid],
                        SEED_ORG_1_ADMIN.user_uuid,
                        { organizationUuid },
                    )
                )[document.documentUuid].spaceUuid,
            ).toBe(targetSpaceUuid);
            await expect(
                model.moveToSpace({
                    projectUuid: input.projectUuid,
                    documentUuid: document.documentUuid,
                    sourceSpaceUuid: input.spaceUuid,
                    targetSpaceUuid,
                }),
            ).rejects.toThrow('has moved');
        });

        test('OR-list permission filtering happens before pagination and never includes siblings', async () => {
            const granted = await model.create(input);
            const sibling = await model.create({
                ...input,
                name: 'Private sibling',
            });
            const visibleSpaceUuid = randomUUID();
            await transaction.raw(
                'INSERT INTO spaces (space_id,space_uuid,project_id) VALUES (2,?,1)',
                [visibleSpaceUuid],
            );
            const visible = await model.create({
                ...input,
                spaceUuid: visibleSpaceUuid,
            });
            await transaction(DocumentsTableName)
                .where('document_uuid', granted.documentUuid)
                .update({ updated_at: new Date('2026-01-01') });
            await transaction(DocumentsTableName)
                .where('document_uuid', sibling.documentUuid)
                .update({ updated_at: new Date('2026-02-01') });
            const first = await model.list(input.projectUuid, {
                spaceUuids: [visibleSpaceUuid],
                documentUuids: [granted.documentUuid],
                limit: 1,
                offset: 0,
            });
            const second = await model.list(input.projectUuid, {
                spaceUuids: [visibleSpaceUuid],
                documentUuids: [granted.documentUuid],
                limit: 1,
                offset: 1,
            });
            expect(first.map((item) => item.documentUuid)).toEqual([
                visible.documentUuid,
            ]);
            expect(second.map((item) => item.documentUuid)).toEqual([
                granted.documentUuid,
            ]);
        });

        test('revocation is idempotent and foreign/missing resources fail closed', async () => {
            const document = await model.create(input);
            await grant(document.documentUuid);
            const args = {
                resourceType: DirectAccessResourceType.DOCUMENT,
                resourceUuid: document.documentUuid,
                organizationUuid,
                principal: {
                    type: DirectAccessPrincipalType.USER,
                    uuid: SEED_ORG_1_ADMIN.user_uuid,
                },
            };
            await grantStore.revokeAccess(args);
            await grantStore.revokeAccess(args);
            expect(
                await accessModel.getUserAccess(
                    [document.documentUuid],
                    SEED_ORG_1_ADMIN.user_uuid,
                    { organizationUuid },
                ),
            ).toEqual({});
            expect(
                await grantStore.findResourceLocation(
                    DirectAccessResourceType.DOCUMENT,
                    document.documentUuid,
                    randomUUID(),
                ),
            ).toBeUndefined();
        });

        test('grant migration rolls back independently without deleting documents', async () => {
            const document = await model.create(input);
            await grantsDown(transaction);
            expect(
                await transaction.schema.hasTable('document_user_access'),
            ).toBe(false);
            expect(
                await model.get(input.projectUuid, document.documentUuid),
            ).toMatchObject(document);
            await grantsUp(transaction);
            await grant(document.documentUuid);
        });

        test('rejects invalid principals and enforces one grant per resource/principal', async () => {
            const document = await model.create(input);
            await expect(
                grantStore.upsertAccess({
                    resourceType: DirectAccessResourceType.DOCUMENT,
                    resourceUuid: document.documentUuid,
                    organizationUuid,
                    principal: {
                        type: DirectAccessPrincipalType.USER,
                        uuid: randomUUID(),
                    },
                    role: SpaceMemberRole.VIEWER,
                    grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                }),
            ).rejects.toThrow('not found');
            await grant(document.documentUuid);
            await expect(
                transaction.transaction(async (savepoint) => {
                    await savepoint('document_user_access').insert({
                        document_uuid: document.documentUuid,
                        user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                        space_role: SpaceMemberRole.EDITOR,
                        granted_by_user_uuid: null,
                    });
                }),
            ).rejects.toMatchObject({ code: '23505' });
            await transaction.raw('UPDATE users SET is_active=false');
            await expect(grant(document.documentUuid)).rejects.toThrow(
                'not found',
            );
        });

        test('grantor deletion sets null; resource and principal deletion cascade', async () => {
            const document = await model.create(input);
            await grant(document.documentUuid, DirectAccessPrincipalType.GROUP);
            await transaction('users')
                .where('user_uuid', SEED_ORG_1_ADMIN.user_uuid)
                .delete();
            expect(
                await transaction('document_group_access').first(),
            ).toMatchObject({ granted_by_user_uuid: null });
            await transaction('groups').where('group_uuid', groupUuid).delete();
            expect(await transaction('document_group_access')).toEqual([]);
            await transaction.raw(
                'INSERT INTO users (user_uuid,is_active) VALUES (?,true)',
                [SEED_ORG_1_ADMIN.user_uuid],
            );
            await transaction('document_user_access').insert({
                document_uuid: document.documentUuid,
                user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                space_role: SpaceMemberRole.VIEWER,
                granted_by_user_uuid: null,
            });
            await transaction(DocumentsTableName)
                .where('document_uuid', document.documentUuid)
                .delete();
            expect(await transaction('document_user_access')).toEqual([]);
            expect(await transaction(DocumentVersionsTableName)).toEqual([]);
        });

        test('move rejects foreign and deleted destinations and preserves original ownership', async () => {
            const document = await model.create(input);
            const foreignSpaceUuid = randomUUID();
            await transaction.raw('INSERT INTO projects VALUES (2,?,1)', [
                randomUUID(),
            ]);
            await transaction.raw(
                'INSERT INTO spaces (space_id,space_uuid,project_id) VALUES (2,?,2)',
                [foreignSpaceUuid],
            );
            await expect(
                model.moveToSpace({
                    projectUuid: input.projectUuid,
                    documentUuid: document.documentUuid,
                    sourceSpaceUuid: input.spaceUuid,
                    targetSpaceUuid: foreignSpaceUuid,
                }),
            ).rejects.toThrow('Space not found');
            await transaction.raw(
                'UPDATE spaces SET project_id=1,deleted_at=NOW() WHERE space_id=2',
            );
            await expect(
                model.moveToSpace({
                    projectUuid: input.projectUuid,
                    documentUuid: document.documentUuid,
                    sourceSpaceUuid: input.spaceUuid,
                    targetSpaceUuid: foreignSpaceUuid,
                }),
            ).rejects.toThrow('Space not found');
            expect(
                (await model.get(input.projectUuid, document.documentUuid))
                    .spaceUuid,
            ).toBe(input.spaceUuid);
        });
    });

    test('slug lookup is exact and scoped to its project', async () => {
        const document = await model.create({
            ...input,
            slug: 'weekly-review',
        });
        const otherProjectUuid = randomUUID();
        const otherSpaceUuid = randomUUID();
        await transaction<{
            project_id: number;
            project_uuid: string;
            organization_id: number;
        }>('projects').insert({
            project_id: 2,
            project_uuid: otherProjectUuid,
            organization_id: 1,
        });
        await transaction<{
            space_id: number;
            space_uuid: string;
            project_id: number;
        }>('spaces').insert({
            space_id: 2,
            space_uuid: otherSpaceUuid,
            project_id: 2,
        });
        const other = await model.create({
            ...input,
            projectUuid: otherProjectUuid,
            spaceUuid: otherSpaceUuid,
            slug: document.slug,
        });
        await expect(
            model.getBySlug(input.projectUuid, document.slug),
        ).resolves.toEqual(document);
        await expect(
            model.getBySlug(otherProjectUuid, document.slug),
        ).resolves.toEqual(other);
        await Promise.all(
            ['weekly', 'Weekly-review', document.documentUuid].map((slug) =>
                expect(
                    model.getBySlug(input.projectUuid, slug),
                ).rejects.toThrow('Document not found'),
            ),
        );
        await expect(
            model.getBySlug(randomUUID(), document.slug),
        ).rejects.toThrow('Document not found');
    });

    test.each(['document', 'space'] as const)(
        'slug lookup hides a deleted %s',
        async (deletedResource) => {
            const document = await model.create(input);
            if (deletedResource === 'document') {
                await transaction(DocumentsTableName)
                    .where('document_uuid', document.documentUuid)
                    .update({ deleted_at: new Date() });
            } else {
                await transaction('spaces')
                    .where('space_uuid', input.spaceUuid)
                    .update({
                        deleted_at: new Date(),
                        deleted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                    });
            }
            await expect(
                model.getBySlug(input.projectUuid, document.slug),
            ).rejects.toThrow('Document not found');
        },
    );

    test('whole-content replacement preserves history and rejects stale writes', async () => {
        const document = await model.create(input);
        const replacement = {
            cells: [
                {
                    id: randomUUID(),
                    type: 'markdown' as const,
                    content: { markdown: '# Replacement' },
                },
            ],
        };
        const request = {
            expectedSpaceUuid: input.spaceUuid,
            baseVersionUuid: document.version.versionUuid,
            content: replacement,
        };
        const updated = await model.updateContent(
            input.projectUuid,
            document.documentUuid,
            request,
            SEED_ORG_1_ADMIN.user_uuid,
        );
        expect(updated.version.content).toEqual(replacement);
        expect(updated.version.versionNumber).toBe(2);
        await expect(
            model.updateContent(
                input.projectUuid,
                document.documentUuid,
                request,
                SEED_ORG_1_ADMIN.user_uuid,
            ),
        ).rejects.toThrow('Document has changed');
        const cleared = await model.updateContent(
            input.projectUuid,
            document.documentUuid,
            {
                ...request,
                baseVersionUuid: updated.version.versionUuid,
                content: { cells: [] },
            },
            SEED_ORG_1_ADMIN.user_uuid,
        );
        expect(cleared.version.content.cells).toEqual([]);
        expect(cleared.version.versionNumber).toBe(3);
        const versions = await transaction(DocumentVersionsTableName)
            .select('content')
            .orderBy('version_number');
        expect(versions.map((version) => version.content)).toEqual([
            input.content,
            replacement,
            { cells: [] },
        ]);
    });

    test('content updates append exactly one immutable version', async () => {
        const document = await model.create(input);
        const updated = await model.updateContent(
            input.projectUuid,
            document.documentUuid,
            {
                expectedSpaceUuid: input.spaceUuid,
                baseVersionUuid: document.version.versionUuid,
                operations: [
                    {
                        type: 'append',
                        cell: {
                            id: 'conclusion',
                            type: 'markdown',
                            content: { markdown: 'Done' },
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
                    expectedSpaceUuid: input.spaceUuid,
                    baseVersionUuid: document.version.versionUuid,
                    operations: [
                        {
                            type: 'append',
                            cell: {
                                id: 'conclusion',
                                type: 'markdown',
                                content: { markdown: 'Done' },
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

    test.each([1, 2])(
        'editing legacy V%s appends V3 without rewriting its identity or payload',
        async (schemaVersion) => {
            const document = await model.create(input);
            const legacyContent = {
                cells: [
                    {
                        id: 'legacy',
                        type: 'markdown',
                        content:
                            schemaVersion === 1
                                ? '# Original'
                                : {
                                      title: 'Retired title',
                                      markdown: '# Original',
                                  },
                    },
                ],
            };
            await transaction.raw(
                'UPDATE ?? SET schema_version = ?, content = ?::jsonb WHERE document_version_uuid = ?',
                [
                    DocumentVersionsTableName,
                    schemaVersion,
                    JSON.stringify(legacyContent),
                    document.version.versionUuid,
                ],
            );
            const legacyRow = await transaction(DocumentVersionsTableName)
                .where('document_version_uuid', document.version.versionUuid)
                .first();
            const updated = await model.updateContent(
                input.projectUuid,
                document.documentUuid,
                {
                    expectedSpaceUuid: input.spaceUuid,
                    baseVersionUuid: document.version.versionUuid,
                    operations: [
                        {
                            type: 'append',
                            cell: {
                                id: 'conclusion',
                                type: 'markdown',
                                content: { markdown: 'Done' },
                            },
                        },
                    ],
                },
                SEED_ORG_1_ADMIN.user_uuid,
            );
            expect(updated.documentUuid).toBe(document.documentUuid);
            expect(updated.version).toMatchObject({
                versionNumber: 2,
                schemaVersion: 3,
                content: {
                    cells: [
                        {
                            id: 'legacy',
                            type: 'markdown',
                            content: { markdown: '# Original' },
                        },
                        {
                            id: 'conclusion',
                            type: 'markdown',
                            content: { markdown: 'Done' },
                        },
                    ],
                },
            });
            expect(updated.version.versionUuid).not.toBe(
                document.version.versionUuid,
            );
            const rows = await transaction(DocumentVersionsTableName).orderBy(
                'version_number',
            );
            expect(rows).toHaveLength(2);
            expect(rows[0]).toEqual(legacyRow);
            expect(rows[1]).toMatchObject({
                schema_version: 3,
                version_number: 2,
                content: updated.version.content,
            });
        },
    );

    test('stale content edits conflict without changing the current version', async () => {
        const document = await model.create(input);
        await expect(
            model.updateContent(
                input.projectUuid,
                document.documentUuid,
                {
                    expectedSpaceUuid: input.spaceUuid,
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
                expectedSpaceUuid: input.spaceUuid,
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
                    {
                        name: 'Renamed again',
                        expectedSpaceUuid: input.spaceUuid,
                    },
                )
            ).slug,
        ).toBe('renamed');
    });

    test.each(['content', 'metadata'] as const)(
        'rejects a stale %s edit after the Document moves from its authorized Space',
        async (mutation) => {
            const document = await model.create(input);
            const targetSpaceUuid = randomUUID();
            await transaction.raw(
                'INSERT INTO spaces (space_id, space_uuid, project_id) VALUES (2, ?, 1)',
                [targetSpaceUuid],
            );
            await transaction(DocumentsTableName)
                .where('document_uuid', document.documentUuid)
                .update({ space_id: 2 });
            const moved = await model.get(
                input.projectUuid,
                document.documentUuid,
            );
            expect(moved.version).toEqual(document.version);

            const pendingEdit =
                mutation === 'content'
                    ? model.updateContent(
                          input.projectUuid,
                          document.documentUuid,
                          {
                              expectedSpaceUuid: document.spaceUuid,
                              baseVersionUuid: document.version.versionUuid,
                              operations: [
                                  { type: 'remove', cellId: 'introduction' },
                              ],
                          },
                          SEED_ORG_1_ADMIN.user_uuid,
                      )
                    : model.updateMetadata(
                          input.projectUuid,
                          document.documentUuid,
                          {
                              expectedSpaceUuid: document.spaceUuid,
                              name: 'Unauthorized rename',
                              slug: 'unauthorized-rename',
                              description: 'Unauthorized description',
                          },
                      );
            await expect(pendingEdit).rejects.toThrow(
                'Document has moved. Reload it and retry',
            );
            expect(
                await model.get(input.projectUuid, document.documentUuid),
            ).toEqual(moved);
            expect(await transaction(DocumentVersionsTableName)).toHaveLength(
                1,
            );
        },
    );

    test('metadata cannot claim another document slug even after soft deletion', async () => {
        const document = await model.create(input);
        const other = await model.create(input);
        await transaction(DocumentsTableName)
            .where('document_uuid', other.documentUuid)
            .update({ deleted_at: new Date() });
        await expect(
            model.updateMetadata(input.projectUuid, document.documentUuid, {
                expectedSpaceUuid: input.spaceUuid,
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
                    {
                        slug: document.slug,
                        expectedSpaceUuid: input.spaceUuid,
                    },
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
                    expectedSpaceUuid: input.spaceUuid,
                    name: 'Not saved',
                }),
            ).rejects.toThrow('Document not found');
            await expect(
                model.updateContent(
                    projectUuid,
                    document.documentUuid,
                    {
                        expectedSpaceUuid: input.spaceUuid,
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
                            expectedSpaceUuid: input.spaceUuid,
                            baseVersionUuid: document.version.versionUuid,
                            operations: [
                                {
                                    type: 'append',
                                    cell: {
                                        id: `writer-${index}`,
                                        type: 'markdown',
                                        content: {
                                            markdown: `Writer ${index}`,
                                        },
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
                    schema_version: 3,
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
