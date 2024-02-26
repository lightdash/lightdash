import { subject } from '@casl/ability';
import {
    Comment,
    ForbiddenError,
    SessionUser,
    SpaceSummary,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { CommentModel } from '../../models/CommentModel/CommentModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SpaceModel } from '../../models/SpaceModel';
import { hasSpaceAccess } from '../SpaceService/SpaceService';

type Dependencies = {
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    commentModel: CommentModel;
};

export class CommentService {
    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    commentModel: CommentModel;

    constructor({ dashboardModel, spaceModel, commentModel }: Dependencies) {
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.commentModel = commentModel;
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

        return this.commentModel.createComment(
            dashboardUuid,
            dashboardTileUuid,
            text,
            replyTo,
            user,
            mentions,
        );
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

        if (canRemoveAnyComment) {
            await this.commentModel.deleteComment(commentId);
        } else {
            const commentOwner = await this.commentModel.getCommentOwner(
                commentId,
            );
            const isOwner = commentOwner === user.userUuid;

            if (isOwner) {
                await this.commentModel.deleteComment(commentId);
            }

            throw new ForbiddenError();
        }
    }
}
