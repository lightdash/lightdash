import { Ability, type RawRuleOf } from '@casl/ability';
import {
    ContentReviewContentType,
    ContentReviewRequestStatus,
    ContentReviewRequestView,
    ContentType,
    DashboardTileTypes,
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    OrganizationMemberRole,
    SpaceMemberRole,
    type ContentReviewRequest,
    type ContentReviewSettings,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import {
    type ContentReviewContentLocation,
    type ContentReviewRequestModel,
    type ContentReviewSpaceInfo,
} from '../../../models/ContentReviewRequestModel';
import { type ContentReviewSettingsModel } from '../../../models/ContentReviewSettingsModel';
import { type ContentVerificationModel } from '../../../models/ContentVerificationModel';
import { type DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { type DirectAccessModel } from '../../../models/DirectAccessModel';
import { type GroupsModel } from '../../../models/GroupsModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type SpaceModel } from '../../../models/SpaceModel';
import { type DashboardService } from '../../../services/DashboardService/DashboardService';
import { type DirectAccessFeatureGate } from '../../../services/DirectAccess/DirectAccessFeatureGate';
import { type SavedChartService } from '../../../services/SavedChartsService/SavedChartService';
import { type SavedSqlService } from '../../../services/SavedSqlService/SavedSqlService';
import { type SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import { type ContentReviewNotificationService } from '../ContentReviewNotificationService/ContentReviewNotificationService';
import { ContentReviewRequestService } from './ContentReviewRequestService';

const ORG = 'org-uuid';
const PROJECT = 'project-uuid';
const PERSONAL_SPACE = 'personal-space-uuid';
const SHARED_SPACE = 'shared-space-uuid';
const CHART = 'chart-uuid';
const REQUESTER = 'requester-uuid';
const REVIEWER = 'reviewer-uuid';

const buildUser = (
    userUuid: string,
    rules: RawRuleOf<Ability<PossibleAbilities>>[] = [],
): SessionUser => ({
    userUuid,
    email: `${userUuid}@test.com`,
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: ORG,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([
        { subject: 'Project', action: 'view' },
        ...rules,
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
});

const requester = buildUser(REQUESTER);
const reviewer = buildUser(REVIEWER);
const verifier = buildUser(REVIEWER, [
    { subject: 'ContentVerification', action: 'manage' },
]);

const chartLocation: ContentReviewContentLocation = {
    uuid: CHART,
    name: 'Weekly revenue',
    slug: 'weekly-revenue',
    spaceUuid: PERSONAL_SPACE,
    dashboardUuid: null,
    deleted: false,
};

const spaces = new Map<string, ContentReviewSpaceInfo>([
    [
        PERSONAL_SPACE,
        {
            uuid: PERSONAL_SPACE,
            name: 'Personal',
            projectUuid: PROJECT,
            isDefaultUserSpace: true,
            deleted: false,
        },
    ],
    [
        SHARED_SPACE,
        {
            uuid: SHARED_SPACE,
            name: 'Finance',
            projectUuid: PROJECT,
            isDefaultUserSpace: false,
            deleted: false,
        },
    ],
]);

const defaultSettings: ContentReviewSettings = {
    projectUuid: PROJECT,
    reviewerGroupUuid: null,
    verifyOnApproveDefault: true,
    slackChannelId: null,
};

const pendingRequest: ContentReviewRequest = {
    uuid: 'request-uuid',
    projectUuid: PROJECT,
    contentType: ContentReviewContentType.CHART,
    contentUuid: CHART,
    sourceSpaceUuid: PERSONAL_SPACE,
    targetSpaceUuid: SHARED_SPACE,
    requestedBy: { userUuid: REQUESTER, firstName: 'Test', lastName: 'User' },
    requestNote: null,
    similarContent: [],
    status: ContentReviewRequestStatus.PENDING,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    verifiedOnApprove: null,
    movedContent: [],
    grantedPrincipals: [
        {
            resourceType: DirectAccessResourceType.CHART,
            resourceUuid: CHART,
            principal: { type: DirectAccessPrincipalType.USER, uuid: REVIEWER },
        },
    ],
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
};

let dashboardModelMock: { getByIdOrSlug: ReturnType<typeof vi.fn> };

const buildService = () => {
    const contentReviewRequestModel = {
        findChartLocations: vi.fn().mockResolvedValue([chartLocation]),
        findDashboardLocations: vi.fn().mockResolvedValue([]),
        findSqlChartLocations: vi.fn().mockResolvedValue([]),
        findSpaceInfo: vi.fn().mockResolvedValue(spaces),
        findPendingByContentUuids: vi.fn().mockResolvedValue(new Map()),
        findPendingByContent: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(pendingRequest),
        getByUuid: vi.fn().mockResolvedValue(pendingRequest),
        list: vi.fn().mockResolvedValue({ data: [pendingRequest] }),
        approve: vi.fn().mockResolvedValue({
            ...pendingRequest,
            status: ContentReviewRequestStatus.APPROVED,
        }),
        reject: vi.fn().mockResolvedValue({
            ...pendingRequest,
            status: ContentReviewRequestStatus.REJECTED,
        }),
        cancel: vi.fn().mockResolvedValue({
            ...pendingRequest,
            status: ContentReviewRequestStatus.CANCELLED,
        }),
        clearGrantedPrincipals: vi.fn().mockResolvedValue(undefined),
        transaction: vi.fn(
            async (callback: (tx: unknown) => Promise<unknown>) =>
                callback('tx'),
        ),
    };
    const contentReviewSettingsModel = {
        get: vi.fn().mockResolvedValue(defaultSettings),
        upsert: vi.fn(),
    };
    const contentVerificationModel = {
        verify: vi.fn().mockResolvedValue(undefined),
    };
    const dashboardModel = { getByIdOrSlug: vi.fn() };
    dashboardModelMock = dashboardModel;
    const dashboardService = { moveToSpace: vi.fn() };
    const directAccessFeatureGate = {
        isEnabledForUser: vi.fn().mockResolvedValue(true),
    };
    const directAccessModel = {
        upsertAccess: vi.fn().mockResolvedValue({}),
        revokeAccess: vi.fn().mockResolvedValue({}),
    };
    const groupsModel = {
        findUserInGroups: vi.fn().mockResolvedValue([]),
        getGroup: vi.fn(),
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({ organizationUuid: ORG }),
    };
    const savedChartService = {
        moveToSpace: vi.fn().mockResolvedValue(undefined),
    };
    const savedSqlService = {
        moveToSpace: vi.fn().mockResolvedValue(undefined),
    };
    const spaceModel = {
        findPersonalSpace: vi.fn().mockResolvedValue({
            uuid: PERSONAL_SPACE,
            name: 'Personal',
            slug: 'personal',
        }),
    };
    const spacePermissionService = {
        can: vi.fn().mockResolvedValue(true),
        getAccessibleSpaceUuids: vi.fn().mockResolvedValue([SHARED_SPACE]),
        getPaginatedSpaceAccess: vi.fn().mockResolvedValue({
            data: [
                { userUuid: REVIEWER, role: SpaceMemberRole.EDITOR },
                { userUuid: 'viewer-uuid', role: SpaceMemberRole.VIEWER },
                { userUuid: REQUESTER, role: SpaceMemberRole.ADMIN },
            ],
        }),
    };
    const analytics = { track: vi.fn() };
    const contentReviewNotificationService = {
        notifySubmitted: vi.fn().mockResolvedValue(undefined),
        notifyDecided: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ContentReviewRequestService({
        analytics: analytics as unknown as LightdashAnalytics,
        contentReviewNotificationService:
            contentReviewNotificationService as unknown as ContentReviewNotificationService,
        contentReviewRequestModel:
            contentReviewRequestModel as unknown as ContentReviewRequestModel,
        contentReviewSettingsModel:
            contentReviewSettingsModel as unknown as ContentReviewSettingsModel,
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        dashboardService: dashboardService as unknown as DashboardService,
        directAccessFeatureGate:
            directAccessFeatureGate as unknown as DirectAccessFeatureGate,
        directAccessModel: directAccessModel as unknown as DirectAccessModel,
        groupsModel: groupsModel as unknown as GroupsModel,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartService: savedChartService as unknown as SavedChartService,
        savedSqlService: savedSqlService as unknown as SavedSqlService,
        spaceModel: spaceModel as unknown as SpaceModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });

    return {
        service,
        contentReviewRequestModel,
        savedSqlService,
        dashboardService,
        contentReviewSettingsModel,
        contentVerificationModel,
        directAccessFeatureGate,
        directAccessModel,
        groupsModel,
        savedChartService,
        spacePermissionService,
        analytics,
        contentReviewNotificationService,
    };
};

const submitBody = {
    contentType: ContentReviewContentType.CHART as const,
    contentUuid: CHART,
    targetSpaceUuid: SHARED_SPACE,
    note: 'Useful for the weekly review',
    similarContent: [],
};

describe('ContentReviewRequestService', () => {
    describe('submit', () => {
        test('grants viewer access to target-space editors and creates the request', async () => {
            const { service, directAccessModel, contentReviewRequestModel } =
                buildService();

            const detail = await service.submit(requester, PROJECT, submitBody);

            expect(directAccessModel.upsertAccess).toHaveBeenCalledTimes(1);
            expect(directAccessModel.upsertAccess).toHaveBeenCalledWith(
                expect.objectContaining({
                    resourceType: DirectAccessResourceType.CHART,
                    resourceUuid: CHART,
                    principal: {
                        type: DirectAccessPrincipalType.USER,
                        uuid: REVIEWER,
                    },
                    role: SpaceMemberRole.VIEWER,
                    grantedByUserUuid: REQUESTER,
                }),
            );
            expect(contentReviewRequestModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    contentUuid: CHART,
                    sourceSpaceUuid: PERSONAL_SPACE,
                    targetSpaceUuid: SHARED_SPACE,
                    requestedByUserUuid: REQUESTER,
                    grantedPrincipals: [
                        expect.objectContaining({ resourceUuid: CHART }),
                    ],
                }),
            );
            expect(detail.content).toEqual({
                name: 'Weekly revenue',
                slug: 'weekly-revenue',
            });
            expect(detail.targetSpaceName).toBe('Finance');
        });

        test('routes to the reviewer group when one is configured', async () => {
            const { service, directAccessModel, contentReviewSettingsModel } =
                buildService();
            contentReviewSettingsModel.get.mockResolvedValue({
                ...defaultSettings,
                reviewerGroupUuid: 'group-uuid',
            });

            await service.submit(requester, PROJECT, submitBody);

            expect(directAccessModel.upsertAccess).toHaveBeenCalledTimes(1);
            expect(directAccessModel.upsertAccess).toHaveBeenCalledWith(
                expect.objectContaining({
                    principal: {
                        type: DirectAccessPrincipalType.GROUP,
                        uuid: 'group-uuid',
                    },
                }),
            );
        });

        test('rejects content that is not in the requester personal space', async () => {
            const { service, contentReviewRequestModel } = buildService();
            contentReviewRequestModel.findChartLocations.mockResolvedValue([
                { ...chartLocation, spaceUuid: SHARED_SPACE },
            ]);

            await expect(
                service.submit(requester, PROJECT, submitBody),
            ).rejects.toThrow('Only content in your personal space');
        });

        test('rejects a personal space as the target', async () => {
            const { service } = buildService();

            await expect(
                service.submit(requester, PROJECT, {
                    ...submitBody,
                    targetSpaceUuid: PERSONAL_SPACE,
                }),
            ).rejects.toThrow('Choose a shared space');
        });

        test('conflicts when the content already has a pending request', async () => {
            const { service, contentReviewRequestModel } = buildService();
            contentReviewRequestModel.findPendingByContentUuids.mockResolvedValue(
                new Map([[CHART, pendingRequest]]),
            );

            await expect(
                service.submit(requester, PROJECT, submitBody),
            ).rejects.toThrow('already waiting for review');
        });

        test('revokes grants when the request row cannot be created', async () => {
            const { service, contentReviewRequestModel, directAccessModel } =
                buildService();
            contentReviewRequestModel.create.mockRejectedValue(
                new Error('boom'),
            );

            await expect(
                service.submit(requester, PROJECT, submitBody),
            ).rejects.toThrow('boom');
            expect(directAccessModel.revokeAccess).toHaveBeenCalledTimes(1);
        });

        test('is forbidden when direct access is off', async () => {
            const { service, directAccessFeatureGate } = buildService();
            directAccessFeatureGate.isEnabledForUser.mockResolvedValue(false);

            await expect(
                service.submit(requester, PROJECT, submitBody),
            ).rejects.toThrow('not enabled');
        });
    });

    describe('approve', () => {
        test('moves without re-checking source access, verifies, and releases grants', async () => {
            const {
                service,
                savedChartService,
                contentVerificationModel,
                directAccessModel,
                contentReviewRequestModel,
            } = buildService();

            await service.approve(verifier, PROJECT, pendingRequest.uuid, {
                verify: true,
                note: null,
            });

            expect(savedChartService.moveToSpace).toHaveBeenCalledWith(
                verifier,
                {
                    projectUuid: PROJECT,
                    itemUuid: CHART,
                    targetSpaceUuid: SHARED_SPACE,
                },
                { tx: 'tx', checkForAccess: false, trackEvent: true },
            );
            expect(contentReviewRequestModel.approve).toHaveBeenCalledWith(
                pendingRequest.uuid,
                expect.objectContaining({
                    reviewedByUserUuid: REVIEWER,
                    verifiedOnApprove: true,
                    movedContent: [
                        {
                            contentType: ContentReviewContentType.CHART,
                            contentUuid: CHART,
                            name: 'Weekly revenue',
                        },
                    ],
                }),
                { tx: 'tx' },
            );
            expect(contentVerificationModel.verify).toHaveBeenCalledWith(
                ContentReviewContentType.CHART,
                CHART,
                PROJECT,
                REVIEWER,
            );
            expect(directAccessModel.revokeAccess).toHaveBeenCalledWith(
                expect.objectContaining({ resourceUuid: CHART }),
            );
            expect(
                contentReviewRequestModel.clearGrantedPrincipals,
            ).toHaveBeenCalledWith(pendingRequest.uuid);
        });

        test('refuses to verify without the verification permission', async () => {
            const { service, savedChartService } = buildService();

            await expect(
                service.approve(reviewer, PROJECT, pendingRequest.uuid, {
                    verify: true,
                    note: null,
                }),
            ).rejects.toThrow('permission to verify');
            expect(savedChartService.moveToSpace).not.toHaveBeenCalled();
        });

        test('requires update rights on the target space', async () => {
            const { service, spacePermissionService } = buildService();
            spacePermissionService.can.mockResolvedValue(false);

            await expect(
                service.approve(reviewer, PROJECT, pendingRequest.uuid, {
                    verify: false,
                    note: null,
                }),
            ).rejects.toThrow('permission to review');
        });

        test('requires reviewer group membership when a group is configured', async () => {
            const { service, contentReviewSettingsModel, groupsModel } =
                buildService();
            contentReviewSettingsModel.get.mockResolvedValue({
                ...defaultSettings,
                reviewerGroupUuid: 'group-uuid',
            });
            groupsModel.findUserInGroups.mockResolvedValue([]);

            await expect(
                service.approve(reviewer, PROJECT, pendingRequest.uuid, {
                    verify: false,
                    note: null,
                }),
            ).rejects.toThrow('permission to review');
        });

        test('conflicts when the request is no longer pending', async () => {
            const { service, contentReviewRequestModel } = buildService();
            contentReviewRequestModel.getByUuid.mockResolvedValue({
                ...pendingRequest,
                status: ContentReviewRequestStatus.REJECTED,
            });

            await expect(
                service.approve(reviewer, PROJECT, pendingRequest.uuid, {
                    verify: false,
                    note: null,
                }),
            ).rejects.toThrow('already been decided');
        });
    });

    describe('reject and cancel', () => {
        test('reject needs a note for the requester', async () => {
            const { service } = buildService();

            await expect(
                service.reject(reviewer, PROJECT, pendingRequest.uuid, {
                    note: '   ',
                }),
            ).rejects.toThrow('why the request was rejected');
        });

        test('reject records the note and releases grants', async () => {
            const { service, contentReviewRequestModel, directAccessModel } =
                buildService();

            const detail = await service.reject(
                reviewer,
                PROJECT,
                pendingRequest.uuid,
                { note: 'Duplicate of the finance dashboard' },
            );

            expect(contentReviewRequestModel.reject).toHaveBeenCalledWith(
                pendingRequest.uuid,
                {
                    reviewedByUserUuid: REVIEWER,
                    reviewNote: 'Duplicate of the finance dashboard',
                },
            );
            expect(directAccessModel.revokeAccess).toHaveBeenCalledTimes(1);
            expect(detail.status).toBe(ContentReviewRequestStatus.REJECTED);
        });

        test('only the requester can cancel', async () => {
            const { service, contentReviewRequestModel } = buildService();

            await expect(
                service.cancel(reviewer, PROJECT, pendingRequest.uuid),
            ).rejects.toThrow('Only the requester');

            await service.cancel(requester, PROJECT, pendingRequest.uuid);
            expect(contentReviewRequestModel.cancel).toHaveBeenCalledWith(
                pendingRequest.uuid,
            );
        });
    });

    describe('list and get', () => {
        test('to-review only shows requests whose target the caller can update', async () => {
            const { service, spacePermissionService } = buildService();
            spacePermissionService.getAccessibleSpaceUuids.mockResolvedValue(
                [],
            );

            const result = await service.list(
                reviewer,
                PROJECT,
                { view: ContentReviewRequestView.TO_REVIEW, status: null },
                { page: 1, pageSize: 10 },
            );

            expect(result.data).toEqual([]);
            expect(result.pagination?.totalResults).toBe(0);
        });

        test('mine lists the caller requests with content and space names', async () => {
            const { service, contentReviewRequestModel } = buildService();

            const result = await service.list(
                requester,
                PROJECT,
                { view: ContentReviewRequestView.MINE, status: null },
                { page: 1, pageSize: 10 },
            );

            expect(contentReviewRequestModel.list).toHaveBeenCalledWith(
                expect.objectContaining({ requestedByUserUuid: REQUESTER }),
            );
            expect(result.data[0].sourceSpaceName).toBe('Personal');
            expect(result.data[0].targetSpaceName).toBe('Finance');
        });

        test('get is forbidden for someone who is neither requester nor reviewer', async () => {
            const { service, spacePermissionService } = buildService();
            spacePermissionService.can.mockResolvedValue(false);

            await expect(
                service.get(
                    buildUser('stranger'),
                    PROJECT,
                    pendingRequest.uuid,
                ),
            ).rejects.toThrow('permission to view');
        });

        test('get reports what approval would move and whether the caller can verify', async () => {
            const { service } = buildService();

            const detail = await service.get(
                verifier,
                PROJECT,
                pendingRequest.uuid,
            );

            expect(detail.canReview).toBe(true);
            expect(detail.canVerify).toBe(true);
            expect(detail.verifyByDefault).toBe(true);
            expect(detail.moveSet).toEqual([
                {
                    contentType: ContentReviewContentType.CHART,
                    contentUuid: CHART,
                    name: 'Weekly revenue',
                },
            ]);
        });
    });

    describe('SQL runner charts', () => {
        const DASHBOARD = 'dashboard-uuid';
        const SQL_CHART = 'sql-chart-uuid';
        const dashboardLocation = {
            uuid: DASHBOARD,
            name: 'Ops board',
            slug: 'ops-board',
            spaceUuid: PERSONAL_SPACE,
            dashboardUuid: null,
            deleted: false,
        };
        const sqlChartLocation = {
            uuid: SQL_CHART,
            name: 'Raw orders',
            slug: 'raw-orders',
            spaceUuid: PERSONAL_SPACE,
            dashboardUuid: null,
            deleted: false,
        };

        test('a dashboard takes its personal-space SQL tiles along', async () => {
            const {
                service,
                contentReviewRequestModel,
                savedSqlService,
                dashboardService,
                contentVerificationModel,
            } = buildService();
            contentReviewRequestModel.getByUuid.mockResolvedValue({
                ...pendingRequest,
                contentType: ContentReviewContentType.DASHBOARD,
                contentUuid: DASHBOARD,
            });
            contentReviewRequestModel.findDashboardLocations.mockResolvedValue([
                dashboardLocation,
            ]);
            contentReviewRequestModel.findChartLocations.mockResolvedValue([]);
            contentReviewRequestModel.findSqlChartLocations.mockResolvedValue([
                sqlChartLocation,
            ]);
            dashboardModelMock.getByIdOrSlug.mockResolvedValue({
                tiles: [
                    {
                        type: DashboardTileTypes.SQL_CHART,
                        properties: { savedSqlUuid: SQL_CHART },
                    },
                ],
            });

            await service.approve(verifier, PROJECT, pendingRequest.uuid, {
                verify: true,
                note: null,
            });

            expect(dashboardService.moveToSpace).toHaveBeenCalledWith(
                verifier,
                expect.objectContaining({ itemUuid: DASHBOARD }),
                expect.anything(),
            );
            expect(savedSqlService.moveToSpace).toHaveBeenCalledWith(
                verifier,
                expect.objectContaining({ itemUuid: SQL_CHART }),
                expect.anything(),
            );
            expect(contentVerificationModel.verify).toHaveBeenCalledWith(
                ContentType.DASHBOARD,
                DASHBOARD,
                PROJECT,
                REVIEWER,
            );
        });

        test('a SQL chart moves through the SQL service and is never verified', async () => {
            const {
                service,
                contentReviewRequestModel,
                savedSqlService,
                savedChartService,
                contentVerificationModel,
            } = buildService();
            contentReviewRequestModel.getByUuid.mockResolvedValue({
                ...pendingRequest,
                contentType: ContentReviewContentType.SQL_CHART,
                contentUuid: SQL_CHART,
            });
            contentReviewRequestModel.findSqlChartLocations.mockResolvedValue([
                sqlChartLocation,
            ]);

            const detail = await service.get(
                verifier,
                PROJECT,
                pendingRequest.uuid,
            );
            expect(detail.canVerify).toBe(false);

            await service.approve(verifier, PROJECT, pendingRequest.uuid, {
                verify: false,
                note: null,
            });

            expect(savedSqlService.moveToSpace).toHaveBeenCalledWith(
                verifier,
                expect.objectContaining({ itemUuid: SQL_CHART }),
                expect.anything(),
            );
            expect(savedChartService.moveToSpace).not.toHaveBeenCalled();
            expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        });
    });
});
