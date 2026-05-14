import { subject } from '@casl/ability';
import {
    Comment,
    DashboardDAO,
    ForbiddenError,
    SessionUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { CommentModel } from '../../models/CommentModel/CommentModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';

type CommentServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    dashboardModel: DashboardModel;
    commentModel: CommentModel;
    notificationsModel: NotificationsModel;
    userModel: UserModel;
    spacePermissionService: SpacePermissionService;
};

export class CommentService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    dashboardModel: DashboardModel;

    commentModel: CommentModel;

    notificationsModel: NotificationsModel;

    userModel: UserModel;

    spacePermissionService: SpacePermissionService;

    constructor({
        lightdashConfig,
        analytics,
        dashboardModel,
        commentModel,
        notificationsModel,
        userModel,
        spacePermissionService,
    }: CommentServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.dashboardModel = dashboardModel;
        this.commentModel = commentModel;
        this.notificationsModel = notificationsModel;
        this.userModel = userModel;
        this.spacePermissionService = spacePermissionService;
    }

    async hasDashboardSpaceAccess(
        user: SessionUser,
        spaceUuid: string,
    ): Promise<boolean> {
        try {
            return await this.spacePermissionService.can(
                'view',
                user,
                spaceUuid,
            );
        } catch (e) {
            Sentry.captureException(e);
            console.error(e);
            return false;
        }
    }

    private throwIfDisabled() {
        if (!this.lightdashConfig.dashboardComments.enabled)
            throw new ForbiddenError('Feature not enabled');
    }

    private async createCommentNotification({
        userUuid,
        comment,
        dashboard,
        dashboardTileUuid,
    }: {
        userUuid: string;
        comment: Comment;
        dashboard: DashboardDAO;
        dashboardTileUuid: string;
    }) {
        const commentingUsersInTile =
            await this.commentModel.findUsersThatCommentedInDashboardTile(
                dashboardTileUuid,
            );

        const taggedUsers = comment.mentions.map((mention) => ({
            userUuid: mention,
            tagged: true,
        }));

        const commentingUsers = commentingUsersInTile
            // Filter out users that have just been tagged to avoid duplicate notifications
            .filter((u) => !taggedUsers.some((t) => t.userUuid === u.userUuid))
            .map((user) => ({
                userUuid: user.userUuid,
                tagged: false,
            }));

        const usersToNotify = [...taggedUsers, ...commentingUsers];

        if (usersToNotify.length === 0) return;

        const dashboardTile = dashboard.tiles.find(
            (t) => t.uuid === dashboardTileUuid,
        );

        if (!dashboardTile) return;

        const commentAuthor =
            await this.userModel.getUserDetailsByUuid(userUuid);

        await this.notificationsModel.createDashboardCommentNotification({
            userUuid,
            commentAuthor,
            comment,
            usersToNotify,
            dashboard,
            dashboardTile,
        });
    }

    async createComment(
        user: SessionUser,
        dashboardUuid: string,
        dashboardTileUuid: string,
        text: string,
        unsafeTextHtml: string,
        replyTo: string | null,
        mentions: string[],
    ): Promise<string> {
        this.throwIfDisabled();

        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('DashboardComments', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                    metadata: { dashboardName: dashboard.name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        this.analytics.track({
            event: 'comment.created',
            userId: user.userUuid,
            properties: {
                dashboardUuid,
                dashboardTileUuid,
                isReply: !!replyTo,
                hasMention: mentions.length > 0,
            },
        });

        const comment = await this.commentModel.createComment(
            dashboardUuid,
            dashboardTileUuid,
            text,
            unsafeTextHtml,
            replyTo,
            user,
            mentions,
        );

        if (!comment) {
            throw new Error('Failed to create comment');
        }

        await this.createCommentNotification({
            userUuid: user.userUuid,
            comment,
            dashboard,
            dashboardTileUuid,
        });

        return comment.commentId;
    }

    async findCommentsForDashboard(
        user: SessionUser,
        dashboardUuidOrSlug: string,
        options?: { projectUuid?: string },
    ): Promise<Record<string, Comment[]>> {
        this.throwIfDisabled();

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            {
                projectUuid: options?.projectUuid,
            },
        );

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('DashboardComments', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                    metadata: { dashboardName: dashboard.name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        const canUserRemoveAnyComment = auditedAbility.can(
            'manage',
            subject('DashboardComments', {
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
                metadata: { dashboardName: dashboard.name },
            }),
        );

        return this.commentModel.findCommentsForDashboard(
            dashboard.uuid,
            user.userUuid,
            canUserRemoveAnyComment,
        );
    }

    async resolveComment(
        user: SessionUser,
        dashboardUuid: string,
        commentId: string,
    ): Promise<void> {
        this.throwIfDisabled();

        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('DashboardComments', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                    metadata: { dashboardName: dashboard.name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        const comment = await this.commentModel.getComment(commentId);

        this.analytics.track({
            event: 'comment.resolved',
            userId: user.userUuid,
            properties: {
                isReply: !!comment.replyTo,
                dashboardTileUuid: comment.dashboardTileUuid,
                dashboardUuid,
                isOwner: comment.userUuid === user.userUuid,
                hasMention: comment.mentions.length > 0,
            },
        });

        return this.commentModel.resolveComment(commentId);
    }

    async deleteComment(
        user: SessionUser,
        dashboardUuid: string,
        commentId: string,
    ): Promise<void> {
        this.throwIfDisabled();

        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);

        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        const auditedAbility = this.createAuditedAbility(user);
        const canRemoveAnyComment = auditedAbility.can(
            'manage',
            subject('DashboardComments', {
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
                metadata: { dashboardName: dashboard.name },
            }),
        );

        const comment = await this.commentModel.getComment(commentId);
        const isOwner = comment.userUuid === user.userUuid;

        if (!canRemoveAnyComment && !isOwner) {
            throw new ForbiddenError();
        }

        if (!canRemoveAnyComment && isOwner) {
            this.logBypassEvent(user, 'delete', {
                type: 'DashboardComments',
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
                metadata: { dashboardName: dashboard.name },
            });
        }

        await this.commentModel.deleteComment(commentId);

        this.analytics.track({
            event: 'comment.deleted',
            userId: user.userUuid,
            properties: {
                isReply: !!comment.replyTo,
                dashboardTileUuid: comment.dashboardTileUuid,
                dashboardUuid,
                isOwner,
                hasMention: comment.mentions.length > 0,
            },
        });
    }
}
