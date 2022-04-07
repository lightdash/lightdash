export enum PageType {
    PAGE = 'page',
    MODAL = 'modal',
}

export enum PageName {
    WELCOME = 'welcome',
    REGISTER = 'register',
    LOGIN = 'login',
    PASSWORD_RECOVERY = 'password_recovery',
    PASSWORD_RESET = 'password_reset',
    SIGNUP = 'signup',
    EXPLORER = 'explorer',
    HOME = 'home',
    EXPLORE_TABLES = 'explore_tables',
    SAVED_QUERIES = 'saved_charts',
    SAVED_QUERY_EXPLORER = 'saved_chart_explorer',
    PROJECT_SETTINGS = 'project_settings',
    PROFILE_SETTINGS = 'profile_settings',
    PASSWORD_SETTINGS = 'password_settings',
    ORGANIZATION_SETTINGS = 'organization_settings',
    USER_MANAGEMENT_SETTINGS = 'user_management_settings',
    PROJECT_MANAGEMENT_SETTINGS = 'project_management_settings',
    INVITE_MANAGEMENT_SETTINGS = 'invite_management_settings',
    ABOUT_LIGHTDASH = 'about_lightdash',
    CREATE_PROJECT = 'create_project',
    CREATE_PROJECT_SETTINGS = 'create_project_settings',
    SAVED_DASHBOARDS = 'saved_dashboards',
    DASHBOARD = 'DASHBOARD',
    SQL_RUNNER = 'SQL_RUNNER',
    SOCIAL_LOGIN_SETTINGS = 'social_login_settings',
    APPEARANCE = 'appearance_settings',
}

export enum CategoryName {
    SETTINGS = 'settings',
}

export enum SectionName {
    EMPTY_RESULTS_TABLE = 'empty_results_table',
    EXPLORER_TOP_BUTTONS = 'explorer_top_buttons',
    SIDEBAR = 'sidebar',
    PAGE_CONTENT = 'page_content',
    PAGE_FOOTER = 'page_footer',
    RESULTS_TABLE = 'results_table',
    DASHBOARD_TILE = 'dashboard_tile',
}

export enum EventName {
    REVOKE_INVITES_BUTTON_CLICKED = 'revoke_invites_button.clicked',
    INVITE_BUTTON_CLICKED = 'invite_users_to_organisation_button.clicked',
    RUN_QUERY_BUTTON_CLICKED = 'run_query_button.clicked',
    SHOW_LINEAGE_BUTTON_CLICKED = 'show_lineage_button.clicked',
    ADD_COLUMN_BUTTON_CLICKED = 'add_column_button.click',
    CREATE_TABLE_CALCULATION_BUTTON_CLICKED = 'create_table_calculation_button.click',
    EDIT_TABLE_CALCULATION_BUTTON_CLICKED = 'edit_table_calculation_button.click',
    UPDATE_TABLE_CALCULATION_BUTTON_CLICKED = 'update_table_calculation_button.click',
    DELETE_TABLE_CALCULATION_BUTTON_CLICKED = 'delete_table_calculation_button.click',
    CONFIRM_DELETE_TABLE_CALCULATION_BUTTON_CLICKED = 'confirm_delete_table_calculation_button.click',
    UPDATE_PROJECT_BUTTON_CLICKED = 'update_project_button.click',
    CREATE_PROJECT_BUTTON_CLICKED = 'create_project_button.click',
    REFRESH_DBT_CONNECTION_BUTTON_CLICKED = 'refresh_dbt_connection_button.click',
    UPDATE_PROJECT_TABLES_CONFIGURATION_BUTTON_CLICKED = 'update_project_tables_configuration.click',
    UPDATE_DASHBOARD_NAME_CLICKED = 'update_dashboard_name.click',
    DOCUMENTATION_BUTTON_CLICKED = 'documentation_button.click',
    ONBOARDING_STEP_CLICKED = 'onboarding_step.click',
    SETUP_STEP_CLICKED = 'setup_step.click',
    FORM_STATE_CHANGED = 'form-state.changed',
    ADD_FILTER_CLICKED = 'add_filter.click',
    APPEARANCE_DEFAULT_CHART_COLORS_UPDATE = 'appearance_default_chart_colours_update.click',
}
