import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    type DashboardDAO,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { CommentModel } from '../../models/CommentModel/CommentModel';
import type { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';
import type { UserModel } from '../../models/UserModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { CommentService } from './CommentService';

// --- Fixtures ---

const dashboard = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    uuid: 'dashboard-uuid',
    name: 'Test Dashboard',
    description: '',
    updatedAt: new Date(),
    tiles: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    tabs: [],
    spaceUuid: 'space-uuid',
    spaceName: 'Test Space',
    views: 0,
    firstViewedAt: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    slug: 'test-dashboard',
    dashboardVersionId: 1,
    versionUuid: 'version-uuid',
    verification: null,
} as DashboardDAO;

const makeCommentRow = (userUuid: string) => ({
    userUuid,
    dashboardTileUuid: 'tile-uuid',
    replyTo: null,
    mentions: [],
});

const baseUser = {
    email: 'test@test.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: 'org-uuid',
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.EDITOR,
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

// User WITH manage permission on DashboardComments
const adminUser: SessionUser = {
    ...baseUser,
    userUuid: 'admin-uuid',
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'DashboardComments',
            action: ['view', 'create', 'manage'],
        },
    ]),
};

// User WITHOUT manage permission (comment owner scenario)
const ownerUser: SessionUser = {
    ...baseUser,
    userUuid: 'owner-uuid',
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'DashboardComments',
            action: ['view', 'create'],
        },
    ]),
};

// User who is neither admin nor owner
const otherUser: SessionUser = {
    ...baseUser,
    userUuid: 'other-uuid',
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'DashboardComments',
            action: ['view', 'create'],
        },
    ]),
};

// --- Mocks ---

const dashboardModel = {
    getByIdOrSlug: jest.fn(async () => dashboard),
};

const commentModel = {
    getComment: jest.fn(async () => makeCommentRow('owner-uuid')),
    deleteComment: jest.fn(async () => undefined),
    createComment: jest.fn(async () => undefined),
    findCommentsForDashboard: jest.fn(async () => ({})),
    findUsersThatCommentedInDashboardTile: jest.fn(async () => []),
};

const notificationsModel = {
    createDashboardCommentNotification: jest.fn(async () => undefined),
};

const userModel = {
    getUserDetailsByUuid: jest.fn(async () => ({
        userUuid: 'owner-uuid',
        firstName: 'Test',
        lastName: 'User',
    })),
};

const spacePermissionService = {
    can: jest.fn(async () => true),
};

describe('CommentService', () => {
    let service: CommentService;
    let logBypassEventSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new CommentService({
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            dashboardModel: dashboardModel as unknown as DashboardModel,
            commentModel: commentModel as unknown as CommentModel,
            notificationsModel:
                notificationsModel as unknown as NotificationsModel,
            userModel: userModel as unknown as UserModel,
            spacePermissionService:
                spacePermissionService as unknown as SpacePermissionService,
        });
        logBypassEventSpy = jest.spyOn(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            service as any,
            'logBypassEvent',
        );
    });

    describe('deleteComment', () => {
        it('allows admin to delete any comment without bypass event', async () => {
            await service.deleteComment(
                adminUser,
                'dashboard-uuid',
                'comment-uuid',
            );

            expect(commentModel.deleteComment).toHaveBeenCalledWith(
                'comment-uuid',
            );
            expect(logBypassEventSpy).not.toHaveBeenCalled();
        });

        it('allows owner to delete their own comment and logs bypass event', async () => {
            await service.deleteComment(
                ownerUser,
                'dashboard-uuid',
                'comment-uuid',
            );

            expect(commentModel.deleteComment).toHaveBeenCalledWith(
                'comment-uuid',
            );
            expect(logBypassEventSpy).toHaveBeenCalledWith(
                ownerUser,
                'delete',
                {
                    type: 'DashboardComments',
                    organizationUuid: 'org-uuid',
                    projectUuid: 'project-uuid',
                    metadata: { dashboardName: 'Test Dashboard' },
                },
            );
        });

        it('throws ForbiddenError for non-owner non-admin', async () => {
            await expect(
                service.deleteComment(
                    otherUser,
                    'dashboard-uuid',
                    'comment-uuid',
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(commentModel.deleteComment).not.toHaveBeenCalled();
            expect(logBypassEventSpy).not.toHaveBeenCalled();
        });

        it('does not throw ForbiddenError after owner deletes own comment (bug fix)', async () => {
            // Verifies the fix for the old bug where owner deletion
            // succeeded but ForbiddenError was still thrown
            const result = service.deleteComment(
                ownerUser,
                'dashboard-uuid',
                'comment-uuid',
            );

            await expect(result).resolves.not.toThrow();
            expect(commentModel.deleteComment).toHaveBeenCalledWith(
                'comment-uuid',
            );
        });

        it('throws ForbiddenError when user lacks space access', async () => {
            spacePermissionService.can.mockResolvedValueOnce(false);

            await expect(
                service.deleteComment(
                    ownerUser,
                    'dashboard-uuid',
                    'comment-uuid',
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(commentModel.deleteComment).not.toHaveBeenCalled();
        });
    });
});
