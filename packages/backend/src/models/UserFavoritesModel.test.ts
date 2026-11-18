import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import { UserFavoritesModel } from './UserFavoritesModel';

describe('UserFavoritesModel getFavoriteDashboards', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new UserFavoritesModel({ database });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('joins only the latest version of each dashboard', async () => {
        tracker.on.select(DashboardsTableName).response([]);

        await model.getFavoriteDashboards(
            'project-uuid',
            ['dashboard-uuid'],
            ['space-uuid'],
        );

        const [query] = tracker.history.select;
        expect(query.sql.replace(/\s+/g, ' ')).toContain(
            `LEFT JOIN LATERAL ( SELECT * FROM "${DashboardVersionsTableName}" AS latest_version WHERE latest_version.dashboard_id = "${DashboardsTableName}"."dashboard_id" ORDER BY latest_version.created_at DESC, latest_version.dashboard_version_id DESC LIMIT 1 ) AS "${DashboardVersionsTableName}" ON TRUE`,
        );
        expect(query.sql).toContain(
            `"${DashboardVersionsTableName}"."dashboard_version_id" is not null`,
        );
        expect(query.sql).not.toContain(`join "${DashboardVersionsTableName}"`);
        expect(query.sql).not.toContain('distinct on');
    });
});
