import {
    ContentReviewContentType,
    ContentReviewRequestStatus,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { ContentReviewRequestModel } from '../../../models/ContentReviewRequestModel';
import { DocumentModel } from '../../../models/DocumentModel';
import { ProjectTableName } from '../../entities/projects';
import { SpaceTableName } from '../../entities/spaces';

describe('Document review requests on the migrated schema', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let documentModel: DocumentModel;
    let reviewModel: ContentReviewRequestModel;
    let sourceSpaceUuid: string;
    let targetSpaceUuid: string;

    const createSpace = async (projectId: number): Promise<string> => {
        const label = randomUUID().replaceAll('-', '');
        const [space] = await transaction(SpaceTableName)
            .insert({
                project_id: projectId,
                name: `Review ${label}`,
                slug: `review-${label}`,
                parent_space_uuid: null,
                path: `review_${label}`,
                inherit_parent_permissions: false,
                is_default_user_space: false,
            })
            .returning('space_uuid');
        return space.space_uuid;
    };

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
        documentModel = new DocumentModel({ database: transaction });
        reviewModel = new ContentReviewRequestModel({ database: transaction });
        const project = await transaction(ProjectTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .first<{ project_id: number }>('project_id');
        if (!project) {
            throw new Error('Seed project missing');
        }
        sourceSpaceUuid = await createSpace(project.project_id);
        targetSpaceUuid = await createSpace(project.project_id);
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    const submit = async () => {
        const document = await documentModel.create({
            projectUuid: SEED_PROJECT.project_uuid,
            spaceUuid: sourceSpaceUuid,
            name: `Review ${randomUUID()}`,
            description: '',
            content: { markdown: '# Findings', charts: {} },
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        const request = await reviewModel.create({
            projectUuid: SEED_PROJECT.project_uuid,
            contentType: ContentReviewContentType.DOCUMENT,
            contentUuid: document.documentUuid,
            sourceSpaceUuid,
            targetSpaceUuid,
            requestedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            requestNote: null,
            similarContent: [],
            grantedPrincipals: [],
        });
        return { document, request };
    };

    test('stores a Document request and resolves its location', async () => {
        const { document, request } = await submit();

        expect(request).toMatchObject({
            contentType: ContentReviewContentType.DOCUMENT,
            contentUuid: document.documentUuid,
            status: ContentReviewRequestStatus.PENDING,
        });
        expect(
            await reviewModel.findDocumentLocations([document.documentUuid]),
        ).toEqual([
            expect.objectContaining({
                uuid: document.documentUuid,
                slug: document.slug,
                spaceUuid: sourceSpaceUuid,
                deleted: false,
            }),
        ]);
    });

    test('deleting the Document cancels its pending request', async () => {
        const { document, request } = await submit();

        await documentModel.softDelete(
            SEED_PROJECT.project_uuid,
            document.documentUuid,
            SEED_ORG_1_ADMIN.user_uuid,
            sourceSpaceUuid,
        );

        expect((await reviewModel.getByUuid(request.uuid)).status).toBe(
            ContentReviewRequestStatus.CANCELLED,
        );
    });
});
