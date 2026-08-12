import { NotFoundError } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { DashboardTileCommentsTableName } from '../../database/entities/comments';
import {
    DashboardsTableName,
    DashboardTilesTableName,
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';
import { CommentModel } from './CommentModel';

const dashboardUuid = 'dashboard-uuid';
const commentId = 'comment-uuid';

const expectDashboardScope = (query: RawQuery) => {
    expect(query.sql).toContain(`from "${DashboardTilesTableName}"`);
    expect(query.sql).toContain(`inner join "${DashboardVersionsTableName}"`);
    expect(query.sql).toContain(`inner join "${DashboardsTableName}"`);
    expect(query.sql).toContain(
        `"${DashboardTilesTableName}"."dashboard_tile_uuid" = "${DashboardTileCommentsTableName}"."dashboard_tile_uuid"`,
    );
    expect(query.bindings).toContain(dashboardUuid);
};

const expectScopedThread = (query: RawQuery) => {
    expect(query.sql).toMatch(
        /where \("comment_id" = \$\d+ or "reply_to" = \$\d+\) and exists/,
    );
    expect(
        query.bindings.filter((binding) => binding === commentId),
    ).toHaveLength(2);
    expectDashboardScope(query);
};

describe('CommentModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new CommentModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('getComment', () => {
        it('scopes the comment lookup to the dashboard', async () => {
            tracker.on.select(DashboardTileCommentsTableName).responseOnce([
                {
                    user_uuid: 'user-uuid',
                    dashboard_tile_uuid: 'tile-uuid',
                    reply_to: null,
                    mentions: [],
                },
            ]);

            await expect(
                model.getComment(dashboardUuid, commentId),
            ).resolves.toEqual({
                userUuid: 'user-uuid',
                dashboardTileUuid: 'tile-uuid',
                replyTo: null,
                mentions: [],
            });

            expectDashboardScope(tracker.history.select[0]);
        });

        it('returns NotFound when no comment matches the dashboard', async () => {
            tracker.on.select(DashboardTileCommentsTableName).responseOnce([]);

            await expect(
                model.getComment(dashboardUuid, commentId),
            ).rejects.toThrow(NotFoundError);
        });
    });

    it('scopes resolve to the dashboard and groups the thread conditions', async () => {
        tracker.on.update(DashboardTileCommentsTableName).responseOnce(2);

        await model.resolveComment(dashboardUuid, commentId);

        expectScopedThread(tracker.history.update[0]);
    });

    it('scopes unresolve to the dashboard and groups the thread conditions', async () => {
        tracker.on.update(DashboardTileCommentsTableName).responseOnce(2);

        await model.unresolveComment(dashboardUuid, commentId);

        expectScopedThread(tracker.history.update[0]);
    });

    it('scopes delete to the dashboard and groups the thread conditions', async () => {
        tracker.on.delete(DashboardTileCommentsTableName).responseOnce(2);

        await model.deleteComment(dashboardUuid, commentId);

        expectScopedThread(tracker.history.delete[0]);
    });
});
