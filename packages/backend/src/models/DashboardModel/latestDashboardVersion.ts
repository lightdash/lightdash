import { Knex } from 'knex';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';

// Joins only each dashboard's latest version, aliased as the versions table,
// so reads don't fan out over every old version before collapsing.
export const leftJoinLatestDashboardVersion = (qb: Knex.QueryBuilder) => {
    void qb.joinRaw(
        `LEFT JOIN LATERAL (
            SELECT * FROM ?? AS latest_version
            WHERE latest_version.dashboard_id = ??
            ORDER BY latest_version.created_at DESC, latest_version.dashboard_version_id DESC
            LIMIT 1
        ) AS ?? ON TRUE`,
        [
            DashboardVersionsTableName,
            `${DashboardsTableName}.dashboard_id`,
            DashboardVersionsTableName,
        ],
    );
};
