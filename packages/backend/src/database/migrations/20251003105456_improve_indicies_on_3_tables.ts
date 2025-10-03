import { Knex } from 'knex';

const DASHBOARD_VIEWS_INDEX =
    'dashboard_views_dashboard_version_id_created_at_idx';
const OPENID_IDENTITIES_INDEX = 'openid_identities_user_id_idx';
const CUSTOM_SQL_TABLE = 'saved_queries_version_custom_sql_dimensions';
const OLD_CONSTRAINT =
    'saved_queries_version_custom_sql_dimensions_id_saved_queries_ve';
const NEW_CONSTRAINT =
    'saved_queries_version_custom_sql_dimensions_version_id_unique';

export async function up(knex: Knex): Promise<void> {
    // 1. Add composite index on dashboard_views (dashboard_version_id, created_at DESC)
    // Optimizes: SELECT * FROM dashboard_views WHERE dashboard_version_id = ? ORDER BY created_at DESC
    // Used in: packages/backend/src/models/DashboardModel/DashboardModel.ts (getDashboard method)
    // Why: This is a high-frequency query when loading dashboards, needed for fetching the most recent view
    await knex.raw(`
        CREATE INDEX ${DASHBOARD_VIEWS_INDEX}
        ON dashboard_views (dashboard_version_id, created_at DESC)
    `);

    // 2. Add index on openid_identities.user_id for JOIN optimization
    // Optimizes: LEFT JOIN openid_identities ON users.user_id = openid_identities.user_id
    // Used in: packages/backend/src/models/UserModel.ts (getUsersWithAuthenticationMethods, multiple methods)
    // Why: High-frequency JOIN when checking user authentication methods, previously missing index on FK
    await knex.raw(`
        CREATE INDEX ${OPENID_IDENTITIES_INDEX}
        ON openid_identities (user_id)
    `);

    // 3. Reorder unique constraint on saved_queries_version_custom_sql_dimensions
    // Optimizes: SELECT * FROM saved_queries_version_custom_sql_dimensions WHERE saved_queries_version_id = ?
    // Used in: packages/backend/src/models/SavedChartModel.ts (get method, fetches custom SQL dimensions)
    // Why: Old index (id, saved_queries_version_id) was inefficient for queries filtering only on saved_queries_version_id
    //      New index (saved_queries_version_id, id) provides same uniqueness but allows efficient range scans
    await knex.raw(`
        ALTER TABLE ${CUSTOM_SQL_TABLE}
        DROP CONSTRAINT ${OLD_CONSTRAINT}
    `);
    await knex.raw(`
        ALTER TABLE ${CUSTOM_SQL_TABLE}
        ADD CONSTRAINT ${NEW_CONSTRAINT} UNIQUE (saved_queries_version_id, id)
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX IF EXISTS ${DASHBOARD_VIEWS_INDEX}`);
    await knex.raw(`DROP INDEX IF EXISTS ${OPENID_IDENTITIES_INDEX}`);

    await knex.raw(`
        ALTER TABLE ${CUSTOM_SQL_TABLE}
        DROP CONSTRAINT ${NEW_CONSTRAINT}
    `);
    await knex.raw(`
        ALTER TABLE ${CUSTOM_SQL_TABLE}
        ADD CONSTRAINT ${OLD_CONSTRAINT} UNIQUE (id, saved_queries_version_id)
    `);
}
