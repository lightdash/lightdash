import { Knex } from 'knex';

const newTableIndexes = {
    analytics_chart_views: ['user_uuid'],
    analytics_dashboard_views: ['user_uuid'],
    cached_explore: ['project_uuid'],
    dashboard_tabs: ['dashboard_id', 'dashboard_version_id'],
    dashboard_tile_charts: [
        'dashboard_tile_uuid',
        'dashboard_version_id',
        'saved_chart_id',
    ],
    dashboard_tile_comments: ['user_uuid', 'reply_to'],
    dashboard_tile_looms: ['dashboard_tile_uuid', 'dashboard_version_id'],
    dashboard_tile_markdowns: ['dashboard_tile_uuid', 'dashboard_version_id'],
    dashboard_tiles: [
        'dashboard_tile_uuid',
        'dashboard_version_id',
        'tab_uuid',
    ],
    dashboard_versions: ['dashboard_id', 'updated_by_user_uuid'],
    dashboard_views: ['dashboard_version_id'],
    dashboards: ['dashboard_uuid'],
    emails: ['user_id'],
    github_app_installations: ['created_by_user_uuid', 'updated_by_user_uuid'],
    group_memberships: ['group_uuid', 'user_id', 'organization_id'],
    group_user_attributes: ['group_uuid', 'user_attribute_uuid'],
    groups: ['organization_id'],
    invite_links: ['organization_id'],
    job_steps: ['job_uuid'],
    jobs: ['user_uuid', 'project_uuid'],
    onboarding: ['organization_id'],
    openid_identities: ['user_id'],
    organization_allowed_email_domain_projects: ['project_uuid'],
    organization_member_user_attributes: [
        'user_id',
        'organization_id',
        'user_attribute_uuid',
    ],
    organization_memberships: ['organization_id', 'user_id'],
    organizations: ['default_project_uuid'],
    password_reset_links: ['email_id'],
    personal_access_token: ['created_by_user_id'],
    pinned_chart: ['pinned_list_uuid', 'saved_chart_uuid'],
    pinned_dashboard: ['pinned_list_uuid', 'dashboard_uuid'],
    pinned_space: ['pinned_list_uuid', 'space_uuid'],
    preview_content: ['project_uuid', 'preview_project_uuid'],
    project_group_access: ['group_uuid', 'project_uuid'],
    project_memberships: ['project_id', 'user_id'],
    project_user_warehouse_credentials_preference: [
        'project_uuid',
        'user_uuid',
        'user_warehouse_credentials_uuid',
    ],
    projects: ['organization_id'],
    saved_queries: ['dashboard_uuid', 'last_version_updated_by_user_uuid'],
    saved_queries_version_custom_dimensions: ['saved_queries_version_id'],
    saved_queries_version_custom_sql_dimensions: ['saved_queries_version_id'],
    saved_queries_version: [
        'saved_queries_version_uuid',
        'updated_by_user_uuid',
        'explore_name',
    ],
    scheduler: ['created_by', 'saved_chart_uuid', 'dashboard_uuid'],
    scheduler_email_target: ['scheduler_uuid'],
    scheduler_slack_target: ['scheduler_uuid'],
    share: ['organization_id', 'created_by_user_id'],
    slack_auth_tokens: ['created_by_user_id'],
    space_group_access: ['group_uuid', 'space_uuid'],
    space_user_access: ['space_uuid', 'user_uuid'],
    spaces: ['project_id', 'created_by_user_id'],
    user_attributes: ['organization_id'],
    user_warehouse_credentials: ['user_uuid'],
};

export async function up(knex: Knex): Promise<void> {
    async function createIndex(table: string, columns: string[]) {
        if (await knex.schema.hasTable(table)) {
            await knex.schema.alterTable(table, (tableBuilder) => {
                columns.forEach((column) => {
                    tableBuilder.index([column]);
                });
            });
        }
    }

    await Promise.all(
        Object.entries(newTableIndexes).map(([table, columns]) =>
            createIndex(table, columns),
        ),
    );
}

export async function down(knex: Knex): Promise<void> {
    async function dropIndex(table: string, columns: string[]) {
        if (await knex.schema.hasTable(table)) {
            await knex.schema.alterTable(table, (tableBuilder) => {
                columns.forEach((column) => {
                    tableBuilder.dropIndex([column]);
                });
            });
        }
    }

    await Promise.all(
        Object.entries(newTableIndexes).map(([table, columns]) =>
            dropIndex(table, columns),
        ),
    );
}
