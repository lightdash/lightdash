import type {
    RecentContentItem,
    RecordRecentContentView,
} from '@lightdash/common';
import type { Knex } from 'knex';
import { RecentContentTableName } from '../database/entities/recentContent';

export const RECENT_CONTENT_CAPACITY = 50;
const RECENT_CONTENT_WINDOW_DAYS = 90;

export class RecentContentModel {
    constructor(private readonly database: Knex) {}

    async recordView({
        userUuid,
        projectUuid,
        contentType,
        contentUuid,
        viewedAt,
    }: RecordRecentContentView & {
        userUuid: string;
        viewedAt: Date;
    }): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx.raw("SET LOCAL lock_timeout = '2s'");
            await trx.raw("SET LOCAL statement_timeout = '5s'");
            await trx.raw(
                'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
                [`recent-content:${userUuid}:${projectUuid}`],
            );
            await trx(RecentContentTableName)
                .insert({
                    user_uuid: userUuid,
                    project_uuid: projectUuid,
                    content_type: contentType,
                    content_uuid: contentUuid,
                    last_viewed_at: viewedAt,
                })
                .onConflict([
                    'user_uuid',
                    'project_uuid',
                    'content_type',
                    'content_uuid',
                ])
                .merge({
                    last_viewed_at: trx.raw(
                        'GREATEST(user_recent_content.last_viewed_at, EXCLUDED.last_viewed_at)',
                    ),
                });
            await trx.raw(
                `
                DELETE FROM user_recent_content
                WHERE user_uuid = ? AND project_uuid = ?
                  AND (last_viewed_at <= now() - make_interval(days => ?)
                    OR (content_type, content_uuid) IN (
                        SELECT content_type, content_uuid FROM user_recent_content
                        WHERE user_uuid = ? AND project_uuid = ?
                        ORDER BY last_viewed_at DESC, content_type, content_uuid
                        OFFSET ?
                    ))
            `,
                [
                    userUuid,
                    projectUuid,
                    RECENT_CONTENT_WINDOW_DAYS,
                    userUuid,
                    projectUuid,
                    RECENT_CONTENT_CAPACITY,
                ],
            );
        });
    }

    async find(
        userUuid: string,
        projectUuid: string,
    ): Promise<RecentContentItem[]> {
        const rows = await this.database(RecentContentTableName)
            .where({ user_uuid: userUuid, project_uuid: projectUuid })
            .where(
                'last_viewed_at',
                '>',
                this.database.raw('now() - make_interval(days => ?)', [
                    RECENT_CONTENT_WINDOW_DAYS,
                ]),
            )
            .orderBy('last_viewed_at', 'desc')
            .orderBy('content_type')
            .orderBy('content_uuid')
            .limit(RECENT_CONTENT_CAPACITY);
        return rows.map((row) => ({
            contentType: row.content_type,
            uuid: row.content_uuid,
            viewedAt: row.last_viewed_at,
        }));
    }
}
