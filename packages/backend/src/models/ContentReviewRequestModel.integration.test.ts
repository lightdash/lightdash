import {
    ChartKind,
    ContentReviewContentType,
    ContentReviewRequestStatus,
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { getTestContext } from '../vitest.setup.integration';
import {
    cancelPendingContentReviewRequests,
    ContentReviewRequestModel,
    type CreateContentReviewRequest,
} from './ContentReviewRequestModel';
import { ContentReviewSettingsModel } from './ContentReviewSettingsModel';

describe('ContentReviewRequestModel PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: ContentReviewRequestModel;
    let projectUuid: string;
    let projectId: number;
    let userId: number;
    let sharedSpaceUuid: string;
    let personalSpaceUuid: string;
    const userUuid = SEED_ORG_1_ADMIN.user_uuid;

    const createSpace = async (
        isDefaultUserSpace: boolean,
    ): Promise<string> => {
        const label = randomUUID().replace(/-/g, '');
        const [space] = await transaction(SpaceTableName)
            .insert({
                project_id: projectId,
                name: `Review space ${label}`,
                created_by_user_id: userId,
                slug: `review-space-${label}`,
                parent_space_uuid: null,
                path: `review_space_${label}`,
                inherit_parent_permissions: false,
                is_default_user_space: isDefaultUserSpace,
            })
            .returning('space_uuid');
        return space.space_uuid;
    };

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new ContentReviewRequestModel({ database: transaction });

        const projectSpace = await transaction(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(
                `${ProjectTableName}.project_uuid`,
                SEED_PROJECT.project_uuid,
            )
            .select<{
                space_uuid: string;
                project_id: number;
                project_uuid: string;
            }>(
                `${SpaceTableName}.space_uuid`,
                `${ProjectTableName}.project_id`,
                `${ProjectTableName}.project_uuid`,
            )
            .first();
        if (!projectSpace) {
            throw new Error('Seed project space not found');
        }
        projectUuid = projectSpace.project_uuid;
        projectId = projectSpace.project_id;
        sharedSpaceUuid = projectSpace.space_uuid;

        const user = await transaction(UserTableName)
            .where('user_uuid', userUuid)
            .first<{ user_id: number }>('user_id');
        if (!user) {
            throw new Error('Seed user not found');
        }
        userId = user.user_id;
        personalSpaceUuid = await createSpace(true);
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    const buildRequest = (
        overrides: Partial<CreateContentReviewRequest> = {},
    ): CreateContentReviewRequest => ({
        projectUuid,
        contentType: ContentReviewContentType.CHART,
        contentUuid: randomUUID(),
        sourceSpaceUuid: personalSpaceUuid,
        targetSpaceUuid: sharedSpaceUuid,
        requestedByUserUuid: userUuid,
        requestNote: 'Useful for the weekly review',
        similarContent: [],
        grantedPrincipals: [
            {
                resourceType: DirectAccessResourceType.CHART,
                resourceUuid: randomUUID(),
                principal: {
                    type: DirectAccessPrincipalType.USER,
                    uuid: userUuid,
                },
            },
        ],
        ...overrides,
    });

    test('creates a pending request with requester and jsonb columns round-tripped', async () => {
        const input = buildRequest();
        const request = await model.create(input);

        expect(request.status).toBe(ContentReviewRequestStatus.PENDING);
        expect(request.contentUuid).toBe(input.contentUuid);
        expect(request.requestedBy.userUuid).toBe(userUuid);
        expect(request.requestedBy.firstName).toBe(SEED_ORG_1_ADMIN.first_name);
        expect(request.reviewedBy).toBeNull();
        expect(request.grantedPrincipals).toEqual(input.grantedPrincipals);
        expect(request.similarContent).toEqual([]);
        expect(request.movedContent).toEqual([]);

        expect(
            await model.findPendingByContent(
                ContentReviewContentType.CHART,
                input.contentUuid,
            ),
        ).toEqual(request);
    });

    test('allows only one pending request per content item', async () => {
        const input = buildRequest();
        await model.create(input);

        await expect(model.create(input)).rejects.toThrow(
            /content_review_requests_pending_unique/,
        );
    });

    test('approve records the decision and lets a new request be opened', async () => {
        const input = buildRequest();
        const created = await model.create(input);

        const approved = await model.approve(created.uuid, {
            reviewedByUserUuid: userUuid,
            reviewNote: null,
            verifiedOnApprove: true,
            movedContent: [
                {
                    contentType: ContentReviewContentType.CHART,
                    contentUuid: input.contentUuid,
                    name: 'Weekly revenue',
                },
            ],
        });

        expect(approved.status).toBe(ContentReviewRequestStatus.APPROVED);
        expect(approved.reviewedBy?.userUuid).toBe(userUuid);
        expect(approved.reviewedAt).not.toBeNull();
        expect(approved.verifiedOnApprove).toBe(true);
        expect(approved.movedContent).toHaveLength(1);
        expect(
            await model.findPendingByContent(
                ContentReviewContentType.CHART,
                input.contentUuid,
            ),
        ).toBeNull();

        const resubmitted = await model.create(input);
        expect(resubmitted.uuid).not.toBe(created.uuid);
    });

    test('reject and cancel are only valid from pending', async () => {
        const created = await model.create(buildRequest());

        const rejected = await model.reject(created.uuid, {
            reviewedByUserUuid: userUuid,
            reviewNote: 'Duplicate of the finance dashboard',
        });
        expect(rejected.status).toBe(ContentReviewRequestStatus.REJECTED);
        expect(rejected.reviewNote).toBe('Duplicate of the finance dashboard');

        await expect(model.cancel(created.uuid)).rejects.toThrow(
            'Review request is not pending',
        );
        await expect(
            model.approve(created.uuid, {
                reviewedByUserUuid: userUuid,
                reviewNote: null,
                verifiedOnApprove: false,
                movedContent: [],
            }),
        ).rejects.toThrow('Review request is not pending');
    });

    test('cancel clears reviewer fields', async () => {
        const created = await model.create(buildRequest());
        const cancelled = await model.cancel(created.uuid);

        expect(cancelled.status).toBe(ContentReviewRequestStatus.CANCELLED);
        expect(cancelled.reviewedBy).toBeNull();
        expect(cancelled.reviewedAt).not.toBeNull();
    });

    test('list filters by status and requester and paginates', async () => {
        const first = await model.create(buildRequest());
        const second = await model.create(buildRequest());
        await model.cancel(second.uuid);

        const pending = await model.list(
            {
                projectUuid,
                status: ContentReviewRequestStatus.PENDING,
                requestedByUserUuid: userUuid,
                targetSpaceUuids: [sharedSpaceUuid],
            },
            { page: 1, pageSize: 10 },
        );
        expect(pending.data.map((r) => r.uuid)).toContain(first.uuid);
        expect(pending.data.map((r) => r.uuid)).not.toContain(second.uuid);
        expect(pending.pagination?.totalResults).toBe(pending.data.length);

        const paged = await model.list(
            {
                projectUuid,
                status: null,
                requestedByUserUuid: null,
                targetSpaceUuids: null,
            },
            { page: 1, pageSize: 1 },
        );
        expect(paged.data).toHaveLength(1);
        expect(paged.pagination?.totalResults).toBeGreaterThanOrEqual(2);
    });

    test('findPendingByContentUuids maps only pending items', async () => {
        const a = buildRequest();
        const b = buildRequest();
        await model.create(a);
        const bCreated = await model.create(b);
        await model.cancel(bCreated.uuid);

        const found = await model.findPendingByContentUuids(
            ContentReviewContentType.CHART,
            [a.contentUuid, b.contentUuid, randomUUID()],
        );
        expect([...found.keys()]).toEqual([a.contentUuid]);
    });

    test('cancelPendingContentReviewRequests cancels pending rows for deleted content', async () => {
        const a = buildRequest();
        const b = buildRequest({
            contentType: ContentReviewContentType.DASHBOARD,
        });
        const aCreated = await model.create(a);
        const bCreated = await model.create(b);

        const count = await cancelPendingContentReviewRequests(
            transaction,
            ContentReviewContentType.CHART,
            [a.contentUuid, b.contentUuid],
        );

        expect(count).toBe(1);
        expect((await model.getByUuid(aCreated.uuid)).status).toBe(
            ContentReviewRequestStatus.CANCELLED,
        );
        expect((await model.getByUuid(bCreated.uuid)).status).toBe(
            ContentReviewRequestStatus.PENDING,
        );
    });

    test('clearGrantedPrincipals empties the audit list', async () => {
        const created = await model.create(buildRequest());
        expect(created.grantedPrincipals).toHaveLength(1);

        await model.clearGrantedPrincipals(created.uuid);

        expect((await model.getByUuid(created.uuid)).grantedPrincipals).toEqual(
            [],
        );
    });

    test('deleting the target space keeps the request with a null target', async () => {
        const targetSpaceUuid = await createSpace(false);
        const created = await model.create(buildRequest({ targetSpaceUuid }));

        await transaction(SpaceTableName)
            .where('space_uuid', targetSpaceUuid)
            .delete();

        expect(
            (await model.getByUuid(created.uuid)).targetSpaceUuid,
        ).toBeNull();
    });

    describe('findSimilarByName', () => {
        const createChart = async (name: string, spaceUuid: string) => {
            const space = await transaction(SpaceTableName)
                .where('space_uuid', spaceUuid)
                .first<{ space_id: number }>('space_id');
            if (!space) throw new Error('space not found');
            const [chart] = await transaction(SavedChartsTableName)
                .insert({
                    name,
                    description: undefined,
                    slug: `similar-${randomUUID()}`,
                    project_uuid: projectUuid,
                    space_id: space.space_id,
                    dashboard_uuid: null,
                    last_version_chart_kind: ChartKind.TABLE,
                    color_palette_uuid: null,
                    last_version_updated_by_user_uuid: userUuid,
                })
                .returning('saved_query_uuid');
            return chart.saved_query_uuid;
        };

        test('ranks exact, contained and word matches in shared spaces only', async () => {
            const exact = await createChart('Weekly Revenue!', sharedSpaceUuid);
            const contained = await createChart(
                'Weekly revenue by region',
                sharedSpaceUuid,
            );
            const wordMatch = await createChart(
                'Revenue forecast',
                sharedSpaceUuid,
            );
            await createChart('Weekly revenue', personalSpaceUuid);
            await createChart('Customer churn', sharedSpaceUuid);
            const self = await createChart('Weekly revenue', sharedSpaceUuid);

            const results = await model.findSimilarByName({
                projectUuid,
                contentType: ContentReviewContentType.CHART,
                name: 'weekly revenue',
                excludeContentUuid: self,
                limit: 10,
            });

            const uuids = results.map((r) => r.uuid);
            expect(uuids.slice(0, 2)).toEqual([exact, contained]);
            expect(uuids).toContain(wordMatch);
            expect(uuids).not.toContain(self);
            expect(results.some((r) => r.spaceUuid === personalSpaceUuid)).toBe(
                false,
            );
            expect(results[0].score).toBeGreaterThan(results[1].score);
        });

        test('returns nothing for an empty name', async () => {
            expect(
                await model.findSimilarByName({
                    projectUuid,
                    contentType: ContentReviewContentType.CHART,
                    name: '   ',
                    excludeContentUuid: null,
                    limit: 5,
                }),
            ).toEqual([]);
        });
    });

    describe('ContentReviewSettingsModel', () => {
        test('returns defaults until settings are written, then upserts', async () => {
            const settings = new ContentReviewSettingsModel({
                database: transaction,
            });

            expect(await settings.get(projectUuid)).toEqual({
                projectUuid,
                reviewerGroupUuid: null,
                verifyOnApproveDefault: true,
                slackChannelId: null,
            });

            const updated = await settings.upsert(projectUuid, {
                verifyOnApproveDefault: false,
            });
            expect(updated.verifyOnApproveDefault).toBe(false);
            expect(updated.reviewerGroupUuid).toBeNull();

            const again = await settings.upsert(projectUuid, {
                slackChannelId: 'C123',
            });
            expect(again.verifyOnApproveDefault).toBe(false);
            expect(again.slackChannelId).toBe('C123');
        });
    });
});
