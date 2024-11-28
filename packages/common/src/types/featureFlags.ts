/**
 * Consider adding a short description of the feature flag and how it
 * will be used.
 *
 * If the feature flag is no longer in use, remove it from this enum.
 */
export enum FeatureFlags {
    /**/
    PassthroughLogin = 'passthrough-login',

    /**
     * Enables custom visualizations when the environment variable is also enabled
     */
    CustomVisualizationsEnabled = 'custom-visualizations-enabled',

    /**/
    ShowDbtCloudProjectOption = 'show-dbt-cloud-project-option',

    /**/
    CustomSQLEnabled = 'custom-sql-enabled',

    /* Show user groups */
    UserGroupsEnabled = 'user-groups-enabled',

    /** Enable dashboard tabs */
    DashboardTabs = 'dashboard_tabs',

    /* Send local timezone to the warehouse session */
    EnableUserTimezones = 'enable-user-timezones',

    /**
     * Enable the semantic layer
     */
    SemanticLayerEnabled = 'semantic-layer-enabled',

    /**
     * Enable dashboard comments
     */
    DashboardComments = 'dashboard-comments-enabled',

    /**
     * Enable metric trees
     */
    MetricTrees = 'metric-trees',
}
