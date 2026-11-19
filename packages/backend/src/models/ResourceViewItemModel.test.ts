import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import { ResourceViewItemModel } from './ResourceViewItemModel';

describe('ResourceViewItemModel pinned dashboards', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ResourceViewItemModel({ database });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('joins only the latest version of each dashboard', async () => {
        tracker.on.select(({ sql }) => sql.length > 0).response([]);

        await model.getAllowedChartsAndDashboards(
            'project-uuid',
            'pinned-list-uuid',
            ['space-uuid'],
        );

        const query = tracker.history.select.find(({ sql }) =>
            sql.includes('pinned_dashboard'),
        );
        expect(query).toBeDefined();
        expect(query!.sql.replace(/\s+/g, ' ')).toContain(
            `LEFT JOIN LATERAL ( SELECT * FROM "${DashboardVersionsTableName}" AS latest_version WHERE latest_version.dashboard_id = "${DashboardsTableName}"."dashboard_id" ORDER BY latest_version.created_at DESC, latest_version.dashboard_version_id DESC LIMIT 1 ) AS "${DashboardVersionsTableName}" ON TRUE`,
        );
        expect(query!.sql).toContain(
            `"${DashboardVersionsTableName}"."dashboard_version_id" is not null`,
        );
        expect(query!.sql).not.toContain(
            `join "${DashboardVersionsTableName}"`,
        );
        expect(query!.sql).not.toContain('distinct on');
    });
});
