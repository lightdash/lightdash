import {
    ContentSortByColumns,
    ContentType,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { ContentModel } from '../../../models/ContentModel/ContentModel';
import { DocumentModel } from '../../../models/DocumentModel';
import { SpaceModel } from '../../../models/SpaceModel';

describe('Document content PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let contentModel: ContentModel;
    let spaceUuid: string;
    let documentUuid: string;

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
    afterAll(async () => database.destroy());
    beforeEach(async () => {
        transaction = await database.transaction();
        const user = await transaction('users')
            .where('user_uuid', SEED_ORG_1_ADMIN.user_uuid)
            .first('user_id');
        if (!user) {
            throw new Error('Seed user missing');
        }
        const space = await new SpaceModel({
            database: transaction,
        }).createSpace(
            {
                name: `Document content ${randomUUID()}`,
                inheritParentPermissions: true,
                parentSpaceUuid: null,
            },
            {
                projectUuid: SEED_PROJECT.project_uuid,
                userId: user.user_id,
                trx: transaction,
            },
        );
        spaceUuid = space.uuid;
        const document = await new DocumentModel({
            database: transaction,
        }).create({
            projectUuid: SEED_PROJECT.project_uuid,
            spaceUuid,
            name: `Content integration ${randomUUID()}`,
            description: 'Metadata only',
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            content: {
                cells: [
                    {
                        type: 'markdown',
                        content: { markdown: 'Body must not be projected' },
                    },
                ],
            },
        });
        documentUuid = document.documentUuid;
        contentModel = new ContentModel({ database: transaction });
    });
    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    it('lists deleted Documents with actor metadata, search and pre-pagination ownership filters', async () => {
        await transaction('documents')
            .where('document_uuid', documentUuid)
            .update({
                deleted_at: new Date(),
                deleted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            });
        const filters = {
            projectUuids: [SEED_PROJECT.project_uuid],
            contentTypes: [ContentType.DOCUMENT],
            documents: { allowedSpaceUuids: [] },
            uuids: [documentUuid],
            deletedByUserUuids: [SEED_ORG_1_ADMIN.user_uuid],
            search: 'Content integration',
        };
        const result = await contentModel.findDeletedContents(filters, {
            page: 1,
            pageSize: 1,
        });
        expect(result.pagination?.totalResults).toBe(1);
        expect(result.data[0]).toMatchObject({
            contentType: ContentType.DOCUMENT,
            uuid: documentUuid,
            deletedBy: { userUuid: SEED_ORG_1_ADMIN.user_uuid },
            spaceUuid,
        });
        expect(
            (
                await contentModel.findDeletedContents({
                    ...filters,
                    deletedByUserUuids: [randomUUID()],
                })
            ).data,
        ).toEqual([]);
        expect(
            (
                await contentModel.findDeletedContents({
                    ...filters,
                    documents: undefined,
                })
            ).data,
        ).toEqual([]);
    });

    it('Space cascade restores only Documents deleted in that cascade, preserving identity and versions', async () => {
        const model = new DocumentModel({ database: transaction });
        const existing = await model.get(
            SEED_PROJECT.project_uuid,
            documentUuid,
        );
        const individuallyDeleted = await model.create({
            projectUuid: SEED_PROJECT.project_uuid,
            spaceUuid,
            name: `Earlier deletion ${randomUUID()}`,
            description: '',
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            content: { cells: [] },
        });
        const oldDeletedAt = new Date();
        await transaction('documents')
            .where('document_uuid', individuallyDeleted.documentUuid)
            .update({
                deleted_at: oldDeletedAt,
                deleted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            });
        const spaces = new SpaceModel({ database: transaction });
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(oldDeletedAt);
        try {
            await spaces.softDelete(spaceUuid, SEED_ORG_1_ADMIN.user_uuid);
        } finally {
            vi.useRealTimers();
        }
        const deletedSpace = await transaction('spaces')
            .where('space_uuid', spaceUuid)
            .first();
        const deletedDocument = await transaction('documents')
            .where('document_uuid', documentUuid)
            .first();
        expect(deletedDocument?.deleted_at).toEqual(deletedSpace?.deleted_at);
        expect(deletedDocument?.deleted_at).toEqual(oldDeletedAt);
        expect(deletedDocument?.deleted_with_space).toBe(true);
        const deletedContent = await contentModel.findDeletedContents({
            uuids: [documentUuid, spaceUuid],
            contentTypes: [ContentType.DOCUMENT, ContentType.SPACE],
            documents: { allowedSpaceUuids: [] },
        });
        expect(deletedContent.data).toEqual([
            expect.objectContaining({
                uuid: spaceUuid,
                contentType: ContentType.SPACE,
                documentCount: 2,
            }),
        ]);
        const hiddenCounts = await contentModel.findDeletedContents({
            uuids: [spaceUuid],
            contentTypes: [ContentType.SPACE],
        });
        expect(hiddenCounts.data[0]).toHaveProperty('documentCount', 0);
        await spaces.restore(spaceUuid);
        expect(
            await model.get(SEED_PROJECT.project_uuid, documentUuid),
        ).toMatchObject({ documentUuid, version: existing.version, spaceUuid });
        expect(
            await transaction('documents')
                .where('document_uuid', documentUuid)
                .first('deleted_with_space'),
        ).toEqual({ deleted_with_space: false });
        expect(
            (
                await transaction('documents')
                    .where('document_uuid', individuallyDeleted.documentUuid)
                    .first()
            )?.deleted_at,
        ).toEqual(oldDeletedAt);
        await spaces.softDelete(spaceUuid, SEED_ORG_1_ADMIN.user_uuid);
        await spaces.permanentDelete(spaceUuid);
        expect(
            await transaction('documents').where('document_uuid', documentUuid),
        ).toEqual([]);
        expect(
            await transaction('document_versions').where(
                'document_version_uuid',
                existing.version.versionUuid,
            ),
        ).toEqual([]);
    });

    it('counts Documents in nested deleted Spaces without exposing counts when disabled', async () => {
        const user = await transaction('users')
            .where('user_uuid', SEED_ORG_1_ADMIN.user_uuid)
            .first('user_id');
        if (!user) {
            throw new Error('Seed user missing');
        }
        const spaces = new SpaceModel({ database: transaction });
        const child = await spaces.createSpace(
            {
                name: `Nested documents ${randomUUID()}`,
                inheritParentPermissions: true,
                parentSpaceUuid: spaceUuid,
            },
            {
                projectUuid: SEED_PROJECT.project_uuid,
                userId: user.user_id,
                trx: transaction,
            },
        );
        await new DocumentModel({ database: transaction }).create({
            projectUuid: SEED_PROJECT.project_uuid,
            spaceUuid: child.uuid,
            name: 'Nested Document',
            description: '',
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            content: { cells: [] },
        });
        await spaces.softDelete(child.uuid, SEED_ORG_1_ADMIN.user_uuid);
        await spaces.softDelete(spaceUuid, SEED_ORG_1_ADMIN.user_uuid);
        const filters = {
            uuids: [spaceUuid],
            contentTypes: [ContentType.SPACE],
        };
        expect(
            (
                await contentModel.findDeletedContents({
                    ...filters,
                    documents: { allowedSpaceUuids: [] },
                })
            ).data[0],
        ).toHaveProperty('documentCount', 2);
        expect(
            (await contentModel.findDeletedContents(filters)).data[0],
        ).toHaveProperty('documentCount', 0);
    });

    it('unions Documents and Spaces with stable pagination and authorized counts', async () => {
        const filters = {
            projectUuids: [SEED_PROJECT.project_uuid],
            spaceUuids: [spaceUuid],
            space: { rootSpaces: true },
            uuids: [documentUuid, spaceUuid],
            contentTypes: [ContentType.DOCUMENT, ContentType.SPACE],
            documents: { allowedSpaceUuids: [spaceUuid] },
        };
        const first = await contentModel.findSummaryContents(
            filters,
            {},
            { page: 1, pageSize: 1 },
        );
        const second = await contentModel.findSummaryContents(
            filters,
            {},
            { page: 2, pageSize: 1 },
        );
        expect(first.pagination?.totalResults).toBe(2);
        expect(first.data[0]).toMatchObject({
            contentType: ContentType.SPACE,
            uuid: spaceUuid,
        });
        expect(second.data[0]).toMatchObject({
            contentType: ContentType.DOCUMENT,
            uuid: documentUuid,
            directAccessRoles: [],
        });
        expect(second.data[0]).not.toHaveProperty('content');
        const counts = await new SpaceModel({
            database: transaction,
        }).getDocumentCounts([spaceUuid]);
        expect(first.data[0]).toHaveProperty(
            'documentCount',
            counts[spaceUuid],
        );
        expect(counts[spaceUuid]).toBeGreaterThan(0);
    });

    it('omits disabled Documents from both rows and pagination and reports zero counts', async () => {
        const result = await contentModel.findSummaryContents(
            {
                uuids: [documentUuid, spaceUuid],
                spaceUuids: [spaceUuid],
                space: { rootSpaces: true },
                contentTypes: [ContentType.SPACE, ContentType.DOCUMENT],
            },
            {},
            { page: 1, pageSize: 10 },
        );
        expect(result.pagination?.totalResults).toBe(1);
        expect(result.data).toEqual([
            expect.objectContaining({ uuid: spaceUuid, documentCount: 0 }),
        ]);
    });

    it('paginates the inherited and direct union without duplicates and applies search before counts', async () => {
        const [sourceSpace] = await transaction('spaces').where(
            'space_uuid',
            spaceUuid,
        );
        const [hiddenSpace] = await transaction('spaces')
            .insert({
                project_id: sourceSpace.project_id,
                name: 'Direct-only content fixture',
                slug: `direct-only-${randomUUID()}`,
                inherit_parent_permissions: false,
                parent_space_uuid: null,
                path: 'direct_only_fixture',
                is_default_user_space: false,
            })
            .returning('space_uuid');
        const hiddenSpaceUuid = hiddenSpace.space_uuid;
        const directDocument = await new DocumentModel({
            database: transaction,
        }).create({
            projectUuid: SEED_PROJECT.project_uuid,
            spaceUuid: hiddenSpaceUuid,
            name: 'A direct-only union fixture',
            description: '',
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            content: {
                cells: [
                    {
                        type: 'markdown',
                        content: { markdown: 'Private content' },
                    },
                ],
            },
        });
        const filters = {
            projectUuids: [SEED_PROJECT.project_uuid],
            contentTypes: [ContentType.DOCUMENT],
            uuids: [documentUuid, directDocument.documentUuid],
            documents: {
                allowedSpaceUuids: [spaceUuid],
                grantedUuids: [documentUuid, directDocument.documentUuid],
            },
        };
        const sort = {
            sortBy: ContentSortByColumns.NAME,
            sortDirection: 'asc' as const,
        };
        const first = await contentModel.findSummaryContents(filters, sort, {
            page: 1,
            pageSize: 1,
        });
        const second = await contentModel.findSummaryContents(filters, sort, {
            page: 2,
            pageSize: 1,
        });
        expect(first.pagination?.totalResults).toBe(2);
        expect(second.pagination?.totalResults).toBe(2);
        expect(first.data.map(({ uuid }) => uuid)).toEqual([
            directDocument.documentUuid,
        ]);
        expect(second.data.map(({ uuid }) => uuid)).toEqual([documentUuid]);
        const search = await contentModel.findSummaryContents(
            { ...filters, search: 'direct-only union' },
            sort,
            { page: 1, pageSize: 1 },
        );
        expect(search.pagination?.totalResults).toBe(1);
        expect(search.data[0].uuid).toBe(directDocument.documentUuid);
        const restricted = await contentModel.findSummaryContents(
            { ...filters, spaceUuids: [spaceUuid] },
            sort,
        );
        expect(restricted.data.map(({ uuid }) => uuid)).toEqual([documentUuid]);
    });

    it('hydrates a direct grant without visible Spaces and excludes deleted Documents', async () => {
        const filters = {
            uuids: [documentUuid],
            contentTypes: [ContentType.DOCUMENT],
            documents: { allowedSpaceUuids: [], grantedUuids: [documentUuid] },
            sharedWithMe: true,
        };
        expect(
            (await contentModel.findSummaryContents(filters, {})).data,
        ).toHaveLength(1);
        expect(
            (
                await contentModel.findSummaryContents(
                    {
                        ...filters,
                        documents: { allowedSpaceUuids: [], grantedUuids: [] },
                    },
                    {},
                )
            ).data,
        ).toHaveLength(0);
        expect(
            (
                await contentModel.findSummaryContents(
                    { ...filters, sharedWithMe: false },
                    {},
                )
            ).data,
        ).toHaveLength(1);
        await transaction('documents')
            .where('document_uuid', documentUuid)
            .update({ deleted_at: new Date() });
        expect(
            (await contentModel.findSummaryContents(filters, {})).data,
        ).toHaveLength(0);
    });
});
