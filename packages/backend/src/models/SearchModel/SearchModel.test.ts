import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';
import { SearchModel } from './index';

describe('SearchModel dashboard tile charts', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new SearchModel({
        database,
        contentVerificationModel: {
            getByContentUuids: async () => new Map(),
        } as never,
    });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    const expectLatestVersionTiles = () => {
        const query = tracker.history.all.find(
            ({ sql }) =>
                sql.includes('dashboard_tile_charts') &&
                sql.includes('LATERAL'),
        );
        expect(query).toBeDefined();
        const sql = query!.sql.replace(/\s+/g, ' ');
        expect(sql).toContain(
            `LEFT JOIN LATERAL ( SELECT * FROM "${DashboardVersionsTableName}" AS latest_version WHERE latest_version.dashboard_id = "${DashboardsTableName}"."dashboard_id" ORDER BY latest_version.created_at DESC, latest_version.dashboard_version_id DESC LIMIT 1 ) AS "${DashboardVersionsTableName}" ON TRUE`,
        );
        expect(sql).not.toContain(`join "${DashboardVersionsTableName}"`);
        expect(sql).not.toContain('dv2');
    };

    it('reads only the latest version in dashboard search results', async () => {
        tracker.on
            .any(({ sql }) => sql.length > 0)
            .response([{ uuid: 'dashboard-uuid' }]);

        await model.searchDashboards('project-uuid', 'query');

        expectLatestVersionTiles();
        // matching and last-modified must pick the same version as the tiles
        const allSql = tracker.history.all.map(({ sql }) => sql).join('\n');
        expect(allSql).not.toMatch(/max\([^)]*dashboard_version_id/i);
        expect(allSql).toContain(
            'ORDER BY created_at DESC, dashboard_version_id DESC LIMIT 1',
        );
        expect(allSql).toContain(
            `distinct on ("${DashboardVersionsTableName}"."dashboard_id")`,
        );
    });

    it('reads only the latest version when listing dashboard charts', async () => {
        tracker.on
            .any(({ sql }) => sql.length > 0)
            .response([{ uuid: 'chart-uuid', name: 'name' }]);

        await model.getDashboardCharts('project-uuid', 'dashboard-uuid', 1, 10);

        expectLatestVersionTiles();
    });
});
