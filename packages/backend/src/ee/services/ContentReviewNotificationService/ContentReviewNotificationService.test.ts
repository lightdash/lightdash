import {
    ContentReviewContentType,
    ContentReviewNotificationEvent,
    ContentReviewRequestStatus,
    EE_SCHEDULER_TASKS,
    SpaceMemberRole,
    type ContentReviewRequestListItem,
    type ContentReviewSettings,
} from '@lightdash/common';
import { type GroupsModel } from '../../../models/GroupsModel';
import { type NotificationsModel } from '../../../models/NotificationsModel/NotificationsModel';
import { type SchedulerClient } from '../../../scheduler/SchedulerClient';
import { type SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import {
    buildContentReviewNotificationMessage,
    ContentReviewNotificationService,
} from './ContentReviewNotificationService';

const ORG = 'org-uuid';
const PROJECT = 'project-uuid';
const REQUESTER = 'requester-uuid';
const EDITOR = 'editor-uuid';
const ADMIN = 'admin-uuid';

const item: ContentReviewRequestListItem = {
    uuid: 'request-uuid',
    projectUuid: PROJECT,
    contentType: ContentReviewContentType.CHART,
    contentUuid: 'chart-uuid',
    sourceSpaceUuid: 'personal-space',
    targetSpaceUuid: 'shared-space',
    requestedBy: {
        userUuid: REQUESTER,
        firstName: 'Ada',
        lastName: 'Lovelace',
    },
    requestNote: 'Useful for the weekly review',
    similarContent: [],
    status: ContentReviewRequestStatus.PENDING,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    verifiedOnApprove: null,
    movedContent: [],
    grantedPrincipals: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    content: { name: 'Weekly revenue', slug: 'weekly-revenue' },
    sourceSpaceName: 'Personal',
    targetSpaceName: 'Finance',
};

const settings: ContentReviewSettings = {
    projectUuid: PROJECT,
    reviewerGroupUuid: null,
    verifyOnApproveDefault: true,
    slackChannelId: null,
};

const buildService = () => {
    const groupsModel = {
        findGroupMembers: vi.fn().mockResolvedValue({
            data: [{ userUuid: ADMIN }, { userUuid: REQUESTER }],
        }),
    };
    const notificationsModel = {
        createContentReviewNotifications: vi.fn().mockResolvedValue(undefined),
    };
    const schedulerClient = {
        scheduleTask: vi.fn().mockResolvedValue(undefined),
    };
    const spacePermissionService = {
        getPaginatedSpaceAccess: vi.fn().mockResolvedValue({
            data: [
                { userUuid: EDITOR, role: SpaceMemberRole.EDITOR },
                { userUuid: ADMIN, role: SpaceMemberRole.ADMIN },
                { userUuid: 'viewer-uuid', role: SpaceMemberRole.VIEWER },
                { userUuid: REQUESTER, role: SpaceMemberRole.ADMIN },
            ],
        }),
    };
    const service = new ContentReviewNotificationService({
        groupsModel: groupsModel as unknown as GroupsModel,
        notificationsModel: notificationsModel as unknown as NotificationsModel,
        schedulerClient: schedulerClient as unknown as SchedulerClient,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });
    return {
        service,
        groupsModel,
        notificationsModel,
        schedulerClient,
        spacePermissionService,
    };
};

describe('ContentReviewNotificationService', () => {
    test('submitted notifies target-space editors and admins, not the requester', async () => {
        const { service, notificationsModel, schedulerClient } = buildService();

        await service.notifySubmitted({
            item,
            settings,
            organizationUuid: ORG,
        });

        expect(
            notificationsModel.createContentReviewNotifications,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                recipients: [{ userUuid: EDITOR }, { userUuid: ADMIN }],
                message:
                    'Ada Lovelace asked for "Weekly revenue" to be reviewed for Finance',
                url: '/projects/project-uuid/review-requests/request-uuid',
                metadata: expect.objectContaining({
                    requestUuid: 'request-uuid',
                    event: ContentReviewNotificationEvent.SUBMITTED,
                    requesterName: 'Ada Lovelace',
                }),
            }),
        );
        expect(schedulerClient.scheduleTask).toHaveBeenCalledWith(
            EE_SCHEDULER_TASKS.SEND_CONTENT_REVIEW_NOTIFICATION,
            {
                organizationUuid: ORG,
                projectUuid: PROJECT,
                requestUuid: 'request-uuid',
                event: ContentReviewNotificationEvent.SUBMITTED,
                recipientUserUuids: [EDITOR, ADMIN],
                userUuid: REQUESTER,
            },
        );
    });

    test('submitted notifies the reviewer group when configured', async () => {
        const { service, groupsModel, schedulerClient } = buildService();

        await service.notifySubmitted({
            item,
            settings: { ...settings, reviewerGroupUuid: 'group-uuid' },
            organizationUuid: ORG,
        });

        expect(groupsModel.findGroupMembers).toHaveBeenCalledWith({
            organizationUuid: ORG,
            groupUuids: ['group-uuid'],
        });
        expect(schedulerClient.scheduleTask).toHaveBeenCalledWith(
            EE_SCHEDULER_TASKS.SEND_CONTENT_REVIEW_NOTIFICATION,
            expect.objectContaining({ recipientUserUuids: [ADMIN] }),
        );
    });

    test('decisions go to the requester only', async () => {
        const { service, notificationsModel, schedulerClient } = buildService();

        await service.notifyDecided({
            item: { ...item, verifiedOnApprove: true },
            event: ContentReviewNotificationEvent.APPROVED,
            organizationUuid: ORG,
            actorUserUuid: ADMIN,
        });

        expect(
            notificationsModel.createContentReviewNotifications,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                recipients: [{ userUuid: REQUESTER }],
                message:
                    '"Weekly revenue" was approved, moved to Finance and verified',
            }),
        );
        expect(schedulerClient.scheduleTask).toHaveBeenCalledWith(
            EE_SCHEDULER_TASKS.SEND_CONTENT_REVIEW_NOTIFICATION,
            expect.objectContaining({
                recipientUserUuids: [REQUESTER],
                userUuid: ADMIN,
            }),
        );
    });

    test('messages cover every event', () => {
        expect(
            buildContentReviewNotificationMessage(
                item,
                ContentReviewNotificationEvent.REJECTED,
            ),
        ).toBe('"Weekly revenue" was not approved for Finance');
        expect(
            buildContentReviewNotificationMessage(
                { ...item, content: null, targetSpaceName: null },
                ContentReviewNotificationEvent.APPROVED,
            ),
        ).toBe('"Deleted content" was approved and moved to a shared space');
    });
});
