import {
    ChartType,
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    getUserAvatarUrl,
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
import { up as ownerUp } from '../20260930150000_add_document_owner_user_uuid_to_documents';
import { up as markdownUp } from '../20261002090000_store_documents_as_markdown_with_chart_tags';
import {
    down as personalDown,
    up as personalUp,
} from '../20261006100000_allow_personal_documents';

describe('DocumentModel PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: DocumentModel;
    let input: CreateDocument & { spaceUuid: string };

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
            CREATE TABLE users (user_id serial UNIQUE, user_uuid uuid PRIMARY KEY DEFAULT uuid_generate_v4(), first_name text, last_name text, avatar_gradient text, is_marketing_opted_in boolean, is_tracking_anonymized boolean, is_setup_complete boolean, is_active boolean);
            CREATE TABLE user_avatars (user_uuid uuid PRIMARY KEY REFERENCES users(user_uuid) ON DELETE CASCADE, content_hash text NOT NULL);
            CREATE TABLE emails (user_id integer NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, email text NOT NULL, is_primary boolean NOT NULL);
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
        await ownerUp(transaction);
        await markdownUp(transaction);
        await personalUp(transaction);
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
            content: { markdown: '# Report', charts: {} },
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
                ALTER TABLE users ADD COLUMN IF NOT EXISTS user_id serial;
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
            ).rejects.toThrow('does not have access to the project');
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
                'does not have access to the project',
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
        const replacement = { markdown: '# Replacement', charts: {} };
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
                content: { markdown: '', charts: {} },
            },
            SEED_ORG_1_ADMIN.user_uuid,
        );
        expect(cleared.version.content).toEqual({ markdown: '', charts: {} });
        expect(cleared.version.versionNumber).toBe(3);
        const versions = await transaction(DocumentVersionsTableName)
            .select('markdown', 'chart_data')
            .orderBy('version_number');
        expect(
            versions.map(({ markdown, chart_data }) => ({
                markdown,
                charts: chart_data,
            })),
        ).toEqual([input.content, replacement, { markdown: '', charts: {} }]);
    });

    test('assigns sequential chart ids from temporary keys and never reuses one', async () => {
        const chart = {
            source: 'semantic' as const,
            chart: {
                name: 'Orders',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_count'],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
                chartConfig: { type: ChartType.TABLE },
            },
        };
        const document = await model.create({
            ...input,
            content: {
                markdown:
                    '# Report\n\n<document-chart id="first">\n\n<document-chart id="second">',
                charts: { first: chart, second: chart, unplaced: chart },
            },
        });
        expect(document.version.content).toEqual({
            markdown:
                '# Report\n\n<document-chart id="c1">\n\n<document-chart id="c2">',
            charts: { c1: chart, c2: chart },
        });
        // Removing c2 and adding a different chart hands out c3, never c2 again.
        const added = { ...chart, chart: { ...chart.chart, name: 'Added' } };
        const updated = await model.updateContent(
            input.projectUuid,
            document.documentUuid,
            {
                expectedSpaceUuid: input.spaceUuid,
                baseVersionUuid: document.version.versionUuid,
                content: {
                    markdown:
                        '<document-chart id="added">\n\n<document-chart id="c1">',
                    charts: { added, c1: chart },
                },
            },
            SEED_ORG_1_ADMIN.user_uuid,
        );
        expect(updated.version.content).toEqual({
            markdown: '<document-chart id="c3">\n\n<document-chart id="c1">',
            charts: { c3: added, c1: chart },
        });
        const [row] = await transaction(DocumentsTableName)
            .where('document_uuid', document.documentUuid)
            .select('next_chart_number');
        expect(row.next_chart_number).toBe(4);
        const versions = await transaction(DocumentVersionsTableName).orderBy(
            'version_number',
        );
        expect(
            versions.map(({ chart_data }) => Object.keys(chart_data as object)),
        ).toEqual([
            ['c1', 'c2'],
            ['c1', 'c3'],
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
                content: {
                    markdown: `${input.content.markdown}\n\nDone`,
                    charts: {},
                },
            },
            SEED_ORG_1_ADMIN.user_uuid,
        );
        expect(updated.version.versionNumber).toBe(2);
        expect(updated.version.versionUuid).not.toBe(
            document.version.versionUuid,
        );
        expect(updated.version.content.markdown).toBe('# Report\n\nDone');
        expect(updated.version.createdByUserUuid).toBe(
            SEED_ORG_1_ADMIN.user_uuid,
        );
        const versions = await transaction(DocumentVersionsTableName).orderBy(
            'version_number',
        );
        expect(versions).toHaveLength(2);
        expect(versions[0].markdown).toEqual(input.content.markdown);
    });

    test('invalid replacement content does not append a version', async () => {
        const document = await model.create(input);
        await expect(
            model.updateContent(
                input.projectUuid,
                document.documentUuid,
                {
                    expectedSpaceUuid: input.spaceUuid,
                    baseVersionUuid: document.version.versionUuid,
                    content: {
                        markdown: null as unknown as string,
                        charts: {},
                    },
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
                    expectedSpaceUuid: input.spaceUuid,
                    baseVersionUuid: randomUUID(),
                    content: { markdown: '', charts: {} },
                },
                SEED_ORG_1_ADMIN.user_uuid,
            ),
        ).rejects.toThrow('Document has changed');
        expect(
            await model.get(input.projectUuid, document.documentUuid),
        ).toEqual(document);
    });

    test('owners are assigned and cleared without counting as an edit', async () => {
        const {
            rows: [owner],
        } = await transaction.raw<{
            rows: Array<{ user_id: number; user_uuid: string }>;
        }>(
            "INSERT INTO users (first_name, last_name) VALUES ('Ada', 'Lovelace') RETURNING user_id, user_uuid",
        );
        await transaction('emails').insert({
            user_id: owner.user_id,
            email: 'ada@example.com',
            is_primary: true,
        });
        const document = await model.create({
            ...input,
            ownerUserUuid: owner.user_uuid,
        });
        expect(document).toMatchObject({
            createdByUserUuid: input.createdByUserUuid,
            ownerUserUuid: owner.user_uuid,
            owner: {
                userUuid: owner.user_uuid,
                firstName: 'Ada',
                lastName: 'Lovelace',
                email: 'ada@example.com',
            },
        });
        const cleared = await model.updateMetadata(
            input.projectUuid,
            document.documentUuid,
            { ownerUserUuid: null, expectedSpaceUuid: input.spaceUuid },
        );
        expect(cleared).toMatchObject({ ownerUserUuid: null, owner: null });
        expect(cleared.updatedAt).toEqual(document.updatedAt);
        const reassigned = await model.updateMetadata(
            input.projectUuid,
            document.documentUuid,
            {
                ownerUserUuid: owner.user_uuid,
                expectedSpaceUuid: input.spaceUuid,
            },
        );
        expect(reassigned.updatedAt).toEqual(document.updatedAt);
        await transaction('users').where('user_uuid', owner.user_uuid).delete();
        expect(
            await model.get(input.projectUuid, document.documentUuid),
        ).toMatchObject({ ownerUserUuid: null, owner: null });
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
                              content: { markdown: '', charts: {} },
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
                        content: { markdown: '', charts: {} },
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
                            content: {
                                markdown: `Writer ${index}`,
                                charts: {},
                            },
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
            expect(persisted.version.content.markdown).toMatch(/^Writer /);
            const versions = await firstConnection(
                DocumentVersionsTableName,
            ).orderBy('version_number');
            expect(versions).toHaveLength(2);
            expect(versions[0].markdown).toEqual(input.content.markdown);
        } finally {
            await Promise.all([
                firstConnection.destroy(),
                secondConnection.destroy(),
            ]);
            await database.raw('DROP SCHEMA ?? CASCADE', [schema]);
        }
    });

    test('returns the original creator independently of the latest editor', async () => {
        await transaction('users')
            .where('user_uuid', input.createdByUserUuid)
            .update({ first_name: 'Original', last_name: 'Author' });
        await transaction.raw('INSERT INTO user_avatars VALUES (?, ?)', [
            input.createdByUserUuid,
            'avatar-hash',
        ]);
        const document = await model.create(input);
        const creator = {
            userUuid: input.createdByUserUuid,
            firstName: 'Original',
            lastName: 'Author',
            avatarUrl: getUserAvatarUrl(
                SEED_ORG_1_ADMIN.user_uuid,
                'avatar-hash',
            ),
            avatarGradient: null,
        };
        expect(document.createdBy).toEqual(creator);
        const editorUuid = randomUUID();
        await transaction.raw(
            'INSERT INTO users (user_uuid, first_name, last_name) VALUES (?, ?, ?)',
            [editorUuid, 'Latest', 'Editor'],
        );
        const updated = await model.updateContent(
            input.projectUuid,
            document.documentUuid,
            {
                expectedSpaceUuid: input.spaceUuid,
                baseVersionUuid: document.version.versionUuid,
                content: { markdown: '', charts: {} },
            },
            editorUuid,
        );
        expect(updated.createdBy).toEqual(creator);
        expect(updated.version.createdByUserUuid).toBe(editorUuid);
    });

    test('returns null for an unattributed document', async () => {
        const document = await model.create({
            ...input,
            createdByUserUuid: null,
        });
        expect(document.createdBy).toBeNull();
    });

    test('returns initials metadata without an uploaded avatar', async () => {
        await transaction('users')
            .where('user_uuid', input.createdByUserUuid)
            .update({
                first_name: 'Original',
                last_name: 'Author',
                avatar_gradient: 'invalid',
            });
        const document = await model.create(input);
        expect(document.createdBy).toEqual({
            userUuid: input.createdByUserUuid,
            firstName: 'Original',
            lastName: 'Author',
            avatarUrl: null,
            avatarGradient: null,
        });
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
        ).toMatchObject({
            schema_version: 2,
            markdown: input.content.markdown,
            chart_data: input.content.charts,
        });
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
            schema_version: 2,
            markdown: '',
            chart_data: JSON.stringify({}),
            created_by_user_uuid: null,
        });
        const latest = await model.get(
            input.projectUuid,
            document.documentUuid,
        );
        expect(latest.version.versionNumber).toBe(2);
        expect(latest.version.content).toEqual({ markdown: '', charts: {} });
    });

    test('lists version history newest first with authors and pages', async () => {
        await transaction('users')
            .where('user_uuid', input.createdByUserUuid)
            .update({ first_name: 'Original', last_name: 'Author' });
        const editorUuid = randomUUID();
        const leaverUuid = randomUUID();
        await transaction.raw(
            'INSERT INTO users (user_uuid, first_name, last_name) VALUES (?, ?, ?), (?, ?, ?)',
            [editorUuid, 'Latest', 'Editor', leaverUuid, 'Gone', 'User'],
        );
        const first = await model.create(input);
        const second = await model.updateContent(
            input.projectUuid,
            first.documentUuid,
            {
                expectedSpaceUuid: input.spaceUuid,
                baseVersionUuid: first.version.versionUuid,
                content: { markdown: '', charts: {} },
            },
            editorUuid,
        );
        const third = await model.updateContent(
            input.projectUuid,
            first.documentUuid,
            {
                expectedSpaceUuid: input.spaceUuid,
                baseVersionUuid: second.version.versionUuid,
                content: { markdown: '', charts: {} },
            },
            leaverUuid,
        );
        await transaction('users').where('user_uuid', leaverUuid).delete();

        const page = await model.listVersions(
            input.projectUuid,
            first.documentUuid,
            { limit: 2, offset: 0 },
        );
        expect(page.items.map((item) => item.versionNumber)).toEqual([3, 2]);
        expect(page.items[0]).toMatchObject({
            versionUuid: third.version.versionUuid,
            createdBy: null,
        });
        expect(page.items[1].createdBy).toMatchObject({
            userUuid: editorUuid,
            firstName: 'Latest',
            lastName: 'Editor',
        });
        expect(page.nextOffset).toBe(2);

        const rest = await model.listVersions(
            input.projectUuid,
            first.documentUuid,
            { limit: 2, offset: 2 },
        );
        expect(rest.items.map((item) => item.versionNumber)).toEqual([1]);
        expect(rest.items[0].createdBy).toMatchObject({
            firstName: 'Original',
            lastName: 'Author',
        });
        expect(rest.nextOffset).toBeNull();
    });

    test('reads a historical version without changing the current one', async () => {
        const first = await model.create(input);
        await model.updateContent(
            input.projectUuid,
            first.documentUuid,
            {
                expectedSpaceUuid: input.spaceUuid,
                baseVersionUuid: first.version.versionUuid,
                content: { markdown: '', charts: {} },
            },
            SEED_ORG_1_ADMIN.user_uuid,
        );
        const historical = await model.getVersion(
            input.projectUuid,
            first.documentUuid,
            first.version.versionUuid,
        );
        expect(historical.version).toMatchObject({
            versionUuid: first.version.versionUuid,
            versionNumber: 1,
            content: input.content,
        });
        const current = await model.get(input.projectUuid, first.documentUuid);
        expect(current.version.versionNumber).toBe(2);
    });

    test('never reads another document version or a foreign project', async () => {
        const first = await model.create(input);
        const other = await model.create({ ...input, name: 'Other' });
        await expect(
            model.getVersion(
                input.projectUuid,
                first.documentUuid,
                other.version.versionUuid,
            ),
        ).rejects.toThrow('Document version not found');
        await expect(
            model.listVersions(randomUUID(), first.documentUuid, {
                limit: 10,
                offset: 0,
            }),
        ).rejects.toThrow('Document not found');
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

    test('rejects invalid content before creating identity or version rows', async () => {
        await expect(
            model.create({
                ...input,
                content: {
                    markdown: '<document-chart id="missing">',
                    charts: {},
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
            markdown: '',
            chart_data: JSON.stringify({}),
            created_by_user_uuid: null,
        });
        await expect(
            model.get(input.projectUuid, document.documentUuid),
        ).rejects.toThrow();
    });

    test('reads a version written as cells by the previous release', async () => {
        const document = await model.create(input);
        const row = await transaction(DocumentsTableName)
            .where('document_uuid', document.documentUuid)
            .first();
        if (!row) {
            throw new Error('Document missing');
        }
        const chart = {
            source: 'semantic',
            chart: {
                name: 'Orders',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_count'],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
                chartConfig: { type: 'table' },
            },
        };
        await transaction.raw(
            `INSERT INTO document_versions (document_id, version_number, schema_version, content)
             VALUES (?, 2, 1, ?::jsonb)`,
            [
                row.document_id,
                JSON.stringify({
                    cells: [
                        { type: 'markdown', content: { markdown: '# Old' } },
                        { type: 'chart', content: chart },
                    ],
                }),
            ],
        );
        const read = await model.get(input.projectUuid, document.documentUuid);
        expect(read.version.content).toEqual({
            markdown: '# Old\n\n<document-chart id="c1">',
            charts: { c1: chart },
        });
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
        expect(preserved.createdBy).toBeNull();
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

    describe('personal Documents', () => {
        test('are created and read without a Space', async () => {
            const document = await model.create({ ...input, spaceUuid: null });

            expect(document.spaceUuid).toBeNull();
            expect(
                await model.get(input.projectUuid, document.documentUuid),
            ).toMatchObject({
                spaceUuid: null,
                createdByUserUuid: input.createdByUserUuid,
            });
        });

        test('stay out of Space lists', async () => {
            const inSpace = await model.create(input);
            await model.create({ ...input, spaceUuid: null });

            expect(await model.listSpaceUuids(input.projectUuid)).toEqual([
                input.spaceUuid,
            ]);
            expect(
                (
                    await model.list(input.projectUuid, {
                        spaceUuids: [input.spaceUuid],
                        limit: 10,
                        offset: 0,
                    })
                ).map(({ documentUuid }) => documentUuid),
            ).toEqual([inSpace.documentUuid]);
        });

        test('move into a Space keeping their identity and versions', async () => {
            const document = await model.create({ ...input, spaceUuid: null });
            await model.updateContent(
                input.projectUuid,
                document.documentUuid,
                {
                    expectedSpaceUuid: null,
                    baseVersionUuid: document.version.versionUuid,
                    content: { markdown: '# Revised', charts: {} },
                },
                SEED_ORG_1_ADMIN.user_uuid,
            );

            const moved = await model.moveToSpace({
                projectUuid: input.projectUuid,
                documentUuid: document.documentUuid,
                sourceSpaceUuid: null,
                targetSpaceUuid: input.spaceUuid,
            });

            expect(moved).toMatchObject({
                documentUuid: document.documentUuid,
                spaceUuid: input.spaceUuid,
                version: { versionNumber: 2 },
            });
        });

        test('restore without an owning Space', async () => {
            const document = await model.create({ ...input, spaceUuid: null });
            await model.softDelete(
                input.projectUuid,
                document.documentUuid,
                SEED_ORG_1_ADMIN.user_uuid,
                null,
            );

            await model.restore(input.projectUuid, document.documentUuid);

            expect(
                await model.get(input.projectUuid, document.documentUuid),
            ).toMatchObject({ spaceUuid: null });
        });

        test('block rolling the migration back until they are moved or deleted', async () => {
            const document = await model.create({ ...input, spaceUuid: null });
            await transaction.raw('SAVEPOINT personal_down');

            await expect(personalDown(transaction)).rejects.toThrow(
                /^irreversible:/,
            );
            await transaction.raw('ROLLBACK TO SAVEPOINT personal_down');
            await transaction(DocumentsTableName)
                .where('document_uuid', document.documentUuid)
                .delete();
            await personalDown(transaction);

            await expect(
                model.create({ ...input, spaceUuid: null }),
            ).rejects.toThrow();
        });
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
                    schema_version: 2,
                    markdown: input.content.markdown,
                    chart_data: JSON.stringify(input.content.charts),
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
