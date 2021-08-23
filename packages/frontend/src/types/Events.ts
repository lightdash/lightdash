export enum PageType {
    PAGE = 'page',
    MODAL = 'modal',
}

export enum PageName {
    REGISTER = 'register',
    LOGIN = 'login',
    SIGNUP = 'signup',
    EXPLORER = 'explorer',
    EXPLORE_TABLES = 'explore_tables',
    SAVED_QUERIES = 'saved_charts',
    SAVED_QUERY_EXPLORER = 'saved_chart_explorer',
    PROFILE_SETTINGS = 'profile_settings',
    PASSWORD_SETTINGS = 'password_settings',
    ORGANIZATION_SETTINGS = 'organization_settings',
    USER_MANAGEMENT_SETTINGS = 'user_management_settings',
    INVITE_MANAGEMENT_SETTINGS = 'invite_management_settings',
    ABOUT_LIGHTDASH = 'about_lightdash',
}

export enum CategoryName {
    SETTINGS = 'settings',
}

export enum SectionName {
    EMPTY_RESULTS_TABLE = 'empty_results_table',
    EXPLORER_TOP_BUTTONS = 'explorer_top_buttons',
    SIDEBAR = 'sidebar',
}

export enum EventName {
    REVOKE_INVITES_BUTTON_CLICKED = 'revoke_invites_button.clicked',
    INVITE_BUTTON_CLICKED = 'invite_users_to_organisation_button.clicked',
    RUN_QUERY_BUTTON_CLICKED = 'run_query_button.clicked',
    SHOW_LINEAGE_BUTTON_CLICKED = 'show_lineage_button.clicked',
}
