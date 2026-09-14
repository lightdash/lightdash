import {
    assertUnreachable,
    ContentReviewNotificationEvent,
    EE_SCHEDULER_TASKS,
    getContentReviewRequestPath,
    SpaceMemberRole,
    type ContentReviewRequestListItem,
    type ContentReviewSettings,
    type NotificationContentReview,
} from '@lightdash/common';
import { type GroupsModel } from '../../../models/GroupsModel';
import { type NotificationsModel } from '../../../models/NotificationsModel/NotificationsModel';
import { type SchedulerClient } from '../../../scheduler/SchedulerClient';
import { BaseService } from '../../../services/BaseService';
import { type SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';

type ContentReviewNotificationServiceArguments = {
    groupsModel: GroupsModel;
    notificationsModel: NotificationsModel;
    schedulerClient: SchedulerClient;
    spacePermissionService: SpacePermissionService;
};

type DispatchArgs = {
    item: ContentReviewRequestListItem;
    event: ContentReviewNotificationEvent;
    recipientUserUuids: string[];
    organizationUuid: string;
    actorUserUuid: string;
};

const requesterName = (item: ContentReviewRequestListItem): string =>
    `${item.requestedBy.firstName} ${item.requestedBy.lastName}`.trim();

export const buildContentReviewNotificationMessage = (
    item: ContentReviewRequestListItem,
    event: ContentReviewNotificationEvent,
): string => {
    const contentName = item.content?.name ?? 'Deleted content';
    const targetSpaceName = item.targetSpaceName ?? 'a shared space';
    switch (event) {
        case ContentReviewNotificationEvent.SUBMITTED:
            return `${requesterName(item)} asked for "${contentName}" to be reviewed for ${targetSpaceName}`;
        case ContentReviewNotificationEvent.APPROVED:
            return item.verifiedOnApprove
                ? `"${contentName}" was approved, moved to ${targetSpaceName} and verified`
                : `"${contentName}" was approved and moved to ${targetSpaceName}`;
        case ContentReviewNotificationEvent.REJECTED:
            return `"${contentName}" was not approved for ${targetSpaceName}`;
        default:
            return assertUnreachable(
                event,
                'Unknown content review notification event',
            );
    }
};

export class ContentReviewNotificationService extends BaseService {
    private readonly groupsModel: GroupsModel;

    private readonly notificationsModel: NotificationsModel;

    private readonly schedulerClient: SchedulerClient;

    private readonly spacePermissionService: SpacePermissionService;

    constructor(args: ContentReviewNotificationServiceArguments) {
        super({ serviceName: 'ContentReviewNotificationService' });
        this.groupsModel = args.groupsModel;
        this.notificationsModel = args.notificationsModel;
        this.schedulerClient = args.schedulerClient;
        this.spacePermissionService = args.spacePermissionService;
    }

    // Mirrors the grant routing: the reviewer group, or whoever can edit the
    // target space, never the requester
    async resolveReviewerUserUuids({
        settings,
        targetSpaceUuid,
        requesterUuid,
        organizationUuid,
    }: {
        settings: ContentReviewSettings;
        targetSpaceUuid: string;
        requesterUuid: string;
        organizationUuid: string;
    }): Promise<string[]> {
        if (settings.reviewerGroupUuid !== null) {
            const { data: members } = await this.groupsModel.findGroupMembers({
                organizationUuid,
                groupUuids: [settings.reviewerGroupUuid],
            });
            return [
                ...new Set(
                    members
                        .map((member) => member.userUuid)
                        .filter((uuid) => uuid !== requesterUuid),
                ),
            ];
        }
        const { data: access } =
            await this.spacePermissionService.getPaginatedSpaceAccess(
                targetSpaceUuid,
                {},
            );
        return access
            .filter(
                (share) =>
                    share.userUuid !== requesterUuid &&
                    (share.role === SpaceMemberRole.EDITOR ||
                        share.role === SpaceMemberRole.ADMIN),
            )
            .map((share) => share.userUuid);
    }

    async notifySubmitted({
        item,
        settings,
        organizationUuid,
    }: {
        item: ContentReviewRequestListItem;
        settings: ContentReviewSettings;
        organizationUuid: string;
    }): Promise<void> {
        if (item.targetSpaceUuid === null) return;
        const recipientUserUuids = await this.resolveReviewerUserUuids({
            settings,
            targetSpaceUuid: item.targetSpaceUuid,
            requesterUuid: item.requestedBy.userUuid,
            organizationUuid,
        });
        await this.dispatch({
            item,
            event: ContentReviewNotificationEvent.SUBMITTED,
            recipientUserUuids,
            organizationUuid,
            actorUserUuid: item.requestedBy.userUuid,
        });
    }

    async notifyDecided({
        item,
        event,
        organizationUuid,
        actorUserUuid,
    }: {
        item: ContentReviewRequestListItem;
        event:
            | ContentReviewNotificationEvent.APPROVED
            | ContentReviewNotificationEvent.REJECTED;
        organizationUuid: string;
        actorUserUuid: string;
    }): Promise<void> {
        await this.dispatch({
            item,
            event,
            recipientUserUuids: [item.requestedBy.userUuid],
            organizationUuid,
            actorUserUuid,
        });
    }

    private async dispatch({
        item,
        event,
        recipientUserUuids,
        organizationUuid,
        actorUserUuid,
    }: DispatchArgs): Promise<void> {
        const metadata: NotificationContentReview['metadata'] = {
            requestUuid: item.uuid,
            projectUuid: item.projectUuid,
            contentType: item.contentType,
            contentUuid: item.contentUuid,
            contentName: item.content?.name ?? 'Deleted content',
            targetSpaceName: item.targetSpaceName ?? '',
            requesterName: requesterName(item),
            event,
        };
        await this.notificationsModel.createContentReviewNotifications({
            recipients: recipientUserUuids.map((userUuid) => ({ userUuid })),
            metadata,
            message: buildContentReviewNotificationMessage(item, event),
            url: getContentReviewRequestPath(item.projectUuid, item.uuid),
        });
        await this.schedulerClient.scheduleTask(
            EE_SCHEDULER_TASKS.SEND_CONTENT_REVIEW_NOTIFICATION,
            {
                organizationUuid,
                projectUuid: item.projectUuid,
                requestUuid: item.uuid,
                event,
                recipientUserUuids,
                userUuid: actorUserUuid,
            },
        );
    }
}
