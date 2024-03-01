import { subject } from '@casl/ability';
import {
    Comment,
    ForbiddenError,
    SessionUser,
    SpaceSummary,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { analytics } from '../../analytics/client';
import { CommentModel } from '../../models/CommentModel/CommentModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserModel } from '../../models/UserModel';
import { hasSpaceAccess } from '../SpaceService/SpaceService';

type CommentServiceArguments = {
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    commentModel: CommentModel;
    notificationsModel: NotificationsModel;
    userModel: UserModel;
};

export class CommentService {
    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    commentModel: CommentModel;

    notificationsModel: NotificationsModel;

    userModel: UserModel;

    constructor({
        dashboardModel,
        spaceModel,
        commentModel,
        notificationsModel,
        userModel,
    }: CommentServiceArguments) {
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.commentModel = commentModel;
        this.notificationsModel = notificationsModel;
        this.userModel = userModel;
    }

    async hasDashboardSpaceAccess(
        user: SessionUser,
        spaceUuid: string,
    ): Promise<boolean> {
        let space: SpaceSummary;

        try {
            space = await this.spaceModel.getSpaceSummary(spaceUuid);
        } catch (e) {
            Sentry.captureException(e);
            console.error(e);
            return false;
        }

        return hasSpaceAccess(user, space);
    }

    async createComment(
        user: SessionUser,
        dashboardUuid: string,
        dashboardTileUuid: string,
        text: string,
        textHtml: string,
        replyTo: string | null,
        mentions: string[],
    ): Promise<string> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        if (
            user.ability.cannot(
                'create',
                subject('DashboardComments', {
                    projectUuid: dashboard.projectUuid,
                    organizationUuid: user.organizationUuid,
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
        analytics.track({
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
            textHtml,
            replyTo,
            user,
            mentions,
        );

        if (!comment) {
            throw new Error('Failed to create comment');
        }

        if (comment.mentions.length > 0) {
            const dashboardTile = dashboard.tiles.find(
                (t) => t.uuid === dashboardTileUuid,
            );

            const commentAuthor = await this.userModel.getUserDetailsByUuid(
                user.userUuid,
            );

            await this.notificationsModel.createDashboardCommentNotification(
                user.userUuid,
                commentAuthor,
                comment,
                dashboard,
                dashboardTile,
            );
        }

        return comment.commentId;
    }

    async findCommentsForDashboard(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Record<string, Comment[]>> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        if (
            user.ability.cannot(
                'view',
                subject('DashboardComments', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
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

        const canUserRemoveAnyComment = user.ability.can(
            'manage',
            subject('DashboardComments', {
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            }),
        );

        return this.commentModel.findCommentsForDashboard(
            dashboardUuid,
            user.userUuid,
            canUserRemoveAnyComment,
        );
    }

    async resolveComment(
        user: SessionUser,
        dashboardUuid: string,
        commentId: string,
    ): Promise<void> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('DashboardComments', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
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

        analytics.track({
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
        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        const canRemoveAnyComment = user.ability.can(
            'manage',
            subject('DashboardComments', {
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            }),
        );

        const comment = await this.commentModel.getComment(commentId);

        if (canRemoveAnyComment) {
            await this.commentModel.deleteComment(commentId);
        } else {
            const isOwner = comment.userUuid === user.userUuid;

            if (isOwner) {
                await this.commentModel.deleteComment(commentId);
            }

            throw new ForbiddenError();
        }

        analytics.track({
            event: 'comment.deleted',
            userId: user.userUuid,
            properties: {
                isReply: !!comment.replyTo,
                dashboardTileUuid: comment.dashboardTileUuid,
                dashboardUuid,
                isOwner: comment.userUuid === user.userUuid,
                hasMention: comment.mentions.length > 0,
            },
        });
    }
}
