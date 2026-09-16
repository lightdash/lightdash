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
        const space = await transaction('spaces')
            .innerJoin('projects', 'projects.project_id', 'spaces.project_id')
            .where('projects.project_uuid', SEED_PROJECT.project_uuid)
            .whereNull('spaces.deleted_at')
            .first('spaces.space_uuid');
        if (!space) {
            throw new Error('Seed Space missing');
        }
        spaceUuid = space.space_uuid;
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
                        id: 'intro',
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
                        id: 'intro',
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
