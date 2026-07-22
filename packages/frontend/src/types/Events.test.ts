import { EventName, PageName } from './Events';

// Analytics names are a contract with the warehouse, not just code: a wrong
// value still typechecks, still ships, and only ever shows up as a missing or
// misnamed event in the data. Adding a name means adding it here in the same
// change, so the contract gets reviewed.
const SHIPPED_EVENT_NAMES = [
    'homepage_quick_action.clicked',
    'homepage_recommended_action.clicked',
    'homepage_recommended_action.skipped',
    'revoke_invites_button.clicked',
    'invite_users_to_organisation_button.clicked',
    'run_query_button.clicked',
    'add_column_button.click',
    'create_table_calculation_button.click',
    'format_metric_button.click',
    'create_quick_table_calculation_button.click',
    'edit_table_calculation_button.click',
    'update_table_calculation_button.click',
    'delete_table_calculation_button.click',
    'confirm_delete_table_calculation_button.click',
    'formula_table_calculation_ai_generate.clicked',
    'update_project_button.click',
    'create_project_button.click',
    'create_project.failed',
    'refresh_dbt_connection_button.click',
    'update_project_tables_configuration.click',
    'update_dashboard_name.click',
    'documentation_button.click',
    'try_demo.clicked',
    'create_project_cli_button.click',
    'create_project_manually_click.click',
    'create_project_agent_button.click',
    'create_project_warehouse_button.click',
    'create_project_cli_sso_option.click',
    'copy_create_project_code_click.click',
    'onboarding_step.click',
    'landing_run_query.click',
    'setup_step.click',
    'add_filter.click',
    'dashboard_filter_lock.toggled',
    'dashboard_filter_requirements.saved',
    'go_to_link.click',
    'add_custom_metric.click',
    'remove_custom_metric.click',
    'notifications.clicked',
    'notifications_item.clicked',
    'notifications_read_more.clicked',
    'embed_download_csv.clicked',
    'embed_download_image.clicked',
    'ownload_image.clicked',
    'custom_axis_range_toggle_clicked',
    'create_project_access.clicked',
    'search_result.clicked',
    'global_search.open',
    'global_search.closed',
    'cross_filtering_apply.click',
    'usage_analytics_clicked',
    'view_underlying_data.clicked',
    'drill_by.clicked',
    'send_now_button.clicked',
    'add_custom_dimension.clicked',
    'date_zoom.clicked',
    'comments.clicked',
    'notifications_comments_item.clicked',
    'dashboard_auto_refresh.updated',
    'metrics_catalog.clicked',
    'metrics_catalog_search.applied',
    'metrics_catalog_chart_usage.clicked',
    'metrics_catalog_chart_usage_chart.clicked',
    'metrics_catalog_explore.clicked',
    'metrics_catalog_category.clicked',
    'metrics_catalog_category_filter.applied',
    'metrics_catalog_icon.applied',
    'metrics_catalog_explore_compare.last_period',
    'metrics_catalog_explore_compare.another_metric',
    'metrics_catalog_explore_date_filter.applied',
    'metrics_catalog_explore_granularity.applied',
    'metrics_catalog_explore_segment_by.applied',
    'metrics_catalog_explore_time_dimension_override.applied',
    'metrics_catalog_trees_edge.created',
    'metrics_catalog_trees_edge.removed',
    'metrics_catalog_trees_canvas_mode.clicked',
    'write_back_from_custom_metric.clicked',
    'write_back_from_custom_metric_header.clicked',
    'write_back_from_custom_dimension.clicked',
    'write_back_from_custom_dimension_header.clicked',
    'custom_fields_replacement.applied',
    'dashboard_chart.loaded',
    'space_breadcrumb.clicked',
    'ai_agent_chart_how_its_calculated.clicked',
    'ai_agent_chart.created',
    'ai_agent_chart.explored',
    'ai_agent_ask.clicked',
    'ai_agent_chat.minimized',
    'ai_agent.suggestion_impression',
    'ai_agent.suggestion_click',
    'theme.toggled',
    'dashboard_ui_version.toggled',
    'signup_form.submitted',
    'otp.resend_clicked',
    'login_flow.method_selected',
    'organization_setup_step.completed',
    'organization_brand.detected',
    'onboarding_warehouse.selected',
    'bigquery_sso.signin_clicked',
    'bigquery_sso.signin_completed',
    'snowflake_cli_sso.command_copied',
    'setup_invite.sent',
    'playground_project.entered',
    'onboarding_project_ready.start_exploring_clicked',
    'homepage_ask.submitted',
    'homepage_recommended_action.impression',
    'homepage_recommended_action.restored',
    'agent_setup_prompt.copied',
    'create_project_columns_defined_button.click',
];

const SHIPPED_PAGE_NAMES = [
    'welcome',
    'register',
    'login',
    'password_recovery',
    'password_reset',
    'signup',
    'explorer',
    'home',
    'explore_tables',
    'saved_charts',
    'saved_chart_explorer',
    'chart_history',
    'dashboard_history',
    'project_settings',
    'profile_settings',
    'general_settings',
    'password_settings',
    'organization_settings',
    'user_management_settings',
    'project_management_settings',
    'invite_management_settings',
    'project_add_user',
    'project_add_group_access',
    'project_manage_group_access',
    'project_update_group_access',
    'about_lightdash',
    'create_project',
    'create_project_settings',
    'saved_dashboards',
    'DASHBOARD',
    'SQL_RUNNER',
    'SOURCE_CODE',
    'SEMANTIC_VIEWER_VIEW',
    'SEMANTIC_VIEWER_EDIT',
    'social_login_settings',
    'appearance_settings',
    'access_tokens',
    'agent_onboarding_run',
    'no_access',
    'no_project_access',
    'space',
    'spaces',
    'share',
    'user_activity',
    'verify_email',
    'join_organization',
    'organization_setup',
    'onboarding_data_source',
    'onboarding_invite_expert',
    'onboarding_project_ready',
    'no_project_homepage',
    'embed_dashboard',
    'embed_saved_chart',
    'embed_explore',
    'embed_data_app',
    'catalog',
    'metrics_catalog',
    'funnel_builder',
];

// Names that predate the convention below, including one misspelling that is
// deliberately kept. Never add to these lists.
const LEGACY_EVENT_NAMES = new Set([
    'invite_users_to_organisation_button.clicked',
    'add_column_button.click',
    'create_table_calculation_button.click',
    'format_metric_button.click',
    'create_quick_table_calculation_button.click',
    'edit_table_calculation_button.click',
    'update_table_calculation_button.click',
    'delete_table_calculation_button.click',
    'confirm_delete_table_calculation_button.click',
    'update_project_button.click',
    'create_project_button.click',
    'refresh_dbt_connection_button.click',
    'update_project_tables_configuration.click',
    'update_dashboard_name.click',
    'documentation_button.click',
    'create_project_cli_button.click',
    'create_project_manually_click.click',
    'create_project_agent_button.click',
    'create_project_warehouse_button.click',
    'create_project_cli_sso_option.click',
    'copy_create_project_code_click.click',
    'onboarding_step.click',
    'landing_run_query.click',
    'setup_step.click',
    'add_filter.click',
    'go_to_link.click',
    'add_custom_metric.click',
    'remove_custom_metric.click',
    'ownload_image.clicked',
    'create_project_access.clicked',
    'cross_filtering_apply.click',
    'send_now_button.clicked',
    'create_project_columns_defined_button.click',
]);

const LEGACY_PAGE_NAMES = new Set([
    'saved_charts',
    'saved_chart_explorer',
    'DASHBOARD',
    'SQL_RUNNER',
    'SOURCE_CODE',
    'SEMANTIC_VIEWER_VIEW',
    'SEMANTIC_VIEWER_EDIT',
    'appearance_settings',
]);

const conventionalValue = (key: string) => key.toLowerCase();

const asKeyValue = ([key, value]: [string, string]) => ({
    key,
    value: value.replace(/\./g, '_'),
});

describe('analytics names', () => {
    it('emits only reviewed event names', () => {
        expect(new Set(Object.values(EventName))).toEqual(
            new Set(SHIPPED_EVENT_NAMES),
        );
    });

    it('emits only reviewed page names', () => {
        expect(new Set(Object.values(PageName))).toEqual(
            new Set(SHIPPED_PAGE_NAMES),
        );
    });

    it('derives new event names from their key', () => {
        Object.entries(EventName)
            .filter(([, value]) => !LEGACY_EVENT_NAMES.has(value))
            .forEach((entry) => {
                const { key, value } = asKeyValue(entry);
                expect({ key, value }).toEqual({
                    key,
                    value: conventionalValue(key),
                });
            });
    });

    it('derives new page names from their key', () => {
        Object.entries(PageName)
            .filter(([, value]) => !LEGACY_PAGE_NAMES.has(value))
            .forEach((entry) => {
                const { key, value } = asKeyValue(entry);
                expect({ key, value }).toEqual({
                    key,
                    value: conventionalValue(key),
                });
            });
    });
});
