import {
    Comment,
    LightdashUser,
    NotFoundError,
    sanitizeHtml,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DashboardTileCommentsTableName,
    DbDashboardTileComments,
} from '../../database/entities/comments';
import {
    DashboardsTableName,
    DashboardTilesTableName,
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';
import { DbUser, UserTableName } from '../../database/entities/users';

type CommentModelArguments = {
    database: Knex;
};

export class CommentModel {
    private readonly database: Knex;

    constructor(args: CommentModelArguments) {
        this.database = args.database;
    }

    private static parseComments(
        commentsWithUsers: (DbDashboardTileComments &
            Pick<DbUser, 'first_name' | 'last_name'>)[],
        userUuid?: string,
        canUserRemoveAnyComment?: boolean,
    ) {
        const commentsPerDashboardTile: Record<string, Comment[]> = {}; // Stores comments grouped by their dashboard_tile_uuid
        const allComments: Record<string, Comment> = {}; // Fast access lookup for parent comments
        const orphanReplies: Record<string, Comment[]> = {}; // Stores orphan replies keyed by their intended parent's commentId

        commentsWithUsers.forEach((comment) => {
            const uuid = comment.dashboard_tile_uuid;
            if (!commentsPerDashboardTile[uuid]) {
                commentsPerDashboardTile[uuid] = [];
            }

            const structuredComment: Comment = {
                commentId: comment.comment_id,
                text: comment.text,
                textHtml: comment.text_html,
                replyTo: comment.reply_to ?? undefined,
                user: { name: `${comment.first_name} ${comment.last_name}` },
                createdAt: comment.created_at,
                resolved: comment.resolved,
                replies: [],
                canRemove:
                    canUserRemoveAnyComment || comment.user_uuid === userUuid,
                mentions: comment.mentions,
            };

            // Directly attach to parent if it's a reply and the parent exists
            if (
                structuredComment.replyTo &&
                allComments[structuredComment.replyTo]
            ) {
                allComments[structuredComment.replyTo].replies?.push(
                    structuredComment,
                );
            } else {
                if (!structuredComment.replyTo) {
                    // For comments that are not replies, add them to the list
                    commentsPerDashboardTile[uuid].push(structuredComment);
                }
                // Store the comment for future reference
                allComments[structuredComment.commentId] = structuredComment;
            }

            // Add the orphan replies to their intended parent if it exists
            if (orphanReplies[structuredComment.commentId]) {
                orphanReplies[structuredComment.commentId].forEach(
                    (orphanReply) => {
                        structuredComment.replies?.push(orphanReply);
                    },
                );

                delete orphanReplies[structuredComment.commentId];
            }

            // If the comment that this reply is intended for doesn't exist yet, store it as an orphan
            if (
                structuredComment.replyTo &&
                !allComments[structuredComment.replyTo]
            ) {
                if (!orphanReplies[structuredComment.replyTo]) {
                    orphanReplies[structuredComment.replyTo] = [];
                }
                orphanReplies[structuredComment.replyTo].push(
                    structuredComment,
                );
            }
        });

        return commentsPerDashboardTile;
    }

    private async checkDashboardTileExistsInDashboard(
        dashboardUuid: string,
        dashboardTileUuid: string,
    ) {
        // NOTE: ensure that this dashboard actually contains the tile, since tile uuids might not be unique across dashboards
        const dashboardTile = await this.database(DashboardTilesTableName)
            .join(
                DashboardVersionsTableName,
                `${DashboardVersionsTableName}.dashboard_version_id`,
                '=',
                `${DashboardTilesTableName}.dashboard_version_id`,
            )
            .join(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_id`,
                '=',
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .leftJoin(
                'dashboard_tile_charts',
                'dashboard_tile_charts.dashboard_tile_uuid',
                'dashboard_tiles.dashboard_tile_uuid',
            )
            .leftJoin(
                'saved_queries',
                'saved_queries.saved_query_id',
                'dashboard_tile_charts.saved_chart_id',
            )
            .where(`${DashboardsTableName}.dashboard_uuid`, dashboardUuid)
            .andWhere(
                `${DashboardTilesTableName}.dashboard_tile_uuid`,
                dashboardTileUuid,
            )
            .select(
                `${DashboardTilesTableName}.dashboard_tile_uuid`,
                `saved_queries.saved_query_uuid`,
            )
            .first();

        if (!dashboardTile) {
            throw new NotFoundError('Dashboard tile not found for dashboard');
        }
        return { savedChartUuid: dashboardTile.saved_query_uuid };
    }

    async createComment(
        dashboardUuid: string,
        dashboardTileUuid: string,
        text: string,
        unsafeTextHtml: string,
        replyTo: string | null,
        user: LightdashUser,
        mentions: string[],
    ): Promise<Comment> {
        const { savedChartUuid } =
            await this.checkDashboardTileExistsInDashboard(
                dashboardUuid,
                dashboardTileUuid,
            );
        const [comment] = await this.database(DashboardTileCommentsTableName)
            .insert({
                text,
                text_html: sanitizeHtml(unsafeTextHtml),
                dashboard_tile_uuid: dashboardTileUuid,
                reply_to: replyTo ?? null,
                user_uuid: user.userUuid,
                saved_chart_uuid: savedChartUuid ?? null,
                mentions,
            })
            .returning('*');

        return {
            commentId: comment.comment_id,
            text: comment.text,
            textHtml: comment.text_html,
            replyTo: comment.reply_to ?? undefined,
            user: { name: `${user.firstName} ${user.lastName}` },
            createdAt: comment.created_at,
            resolved: comment.resolved,
            replies: [],
            canRemove: true,
            mentions: comment.mentions,
        };
    }

    async findCommentsForDashboard(
        dashboardUuid: string,
        userUuid: string,
        canUserRemoveAnyComment: boolean,
    ): Promise<Record<string, Comment[]>> {
        const dashboard = await this.database(DashboardsTableName)
            .leftJoin(
                DashboardVersionsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .where('dashboard_uuid', dashboardUuid)
            .orderBy(`${DashboardVersionsTableName}.created_at`, 'desc')
            .limit(1)
            .first();

        if (dashboard === undefined)
            throw new NotFoundError('Dashboard not found');

        const tiles = await this.database(DashboardTilesTableName)
            .select('dashboard_tile_uuid')
            .where('dashboard_version_id', dashboard.dashboard_version_id);
        const tileUuids = tiles.map((tile) => tile.dashboard_tile_uuid);

        const commentsWithUsers = await this.database(
            DashboardTileCommentsTableName,
        )
            .leftJoin(
                UserTableName,
                `${DashboardTileCommentsTableName}.user_uuid`,
                '=',
                `${UserTableName}.user_uuid`,
            )
            .select(
                `${DashboardTileCommentsTableName}.*`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${DashboardTileCommentsTableName}.dashboard_tile_uuid`,
            )
            .whereIn(
                `${DashboardTileCommentsTableName}.dashboard_tile_uuid`,
                tileUuids,
            )
            .andWhere(`${DashboardTileCommentsTableName}.resolved`, false)
            .orderBy(`${DashboardTileCommentsTableName}.created_at`, 'asc');

        return CommentModel.parseComments(
            commentsWithUsers,
            userUuid,
            canUserRemoveAnyComment,
        );
    }

    async findUsersThatCommentedInDashboardTile(
        dashboardTileUuid: string,
    ): Promise<Pick<LightdashUser, 'userUuid'>[]> {
        const usersThatCommentedInDashboardTile = await this.database(
            DashboardTileCommentsTableName,
        )
            .distinct('user_uuid')
            .where('dashboard_tile_uuid', dashboardTileUuid);

        return usersThatCommentedInDashboardTile.map((comment) => ({
            userUuid: comment.user_uuid,
        }));
    }

    async resolveComment(commentId: string): Promise<void> {
        await this.database(DashboardTileCommentsTableName)
            .update({ resolved: true })
            .where('comment_id', commentId);
    }

    async getComment(commentId: string) {
        const result = await this.database(DashboardTileCommentsTableName)
            .select('user_uuid', 'dashboard_tile_uuid', 'reply_to', 'mentions')
            .where('comment_id', commentId)
            .first();

        if (result === undefined) throw new NotFoundError('Comment not found');

        return {
            userUuid: result.user_uuid,
            dashboardTileUuid: result.dashboard_tile_uuid,
            replyTo: result.reply_to,
            mentions: result.mentions,
        };
    }

    async deleteComment(commentId: string): Promise<void> {
        await this.database(DashboardTileCommentsTableName)
            .delete()
            .where('reply_to', commentId)
            .orWhere('comment_id', commentId);
    }
}
