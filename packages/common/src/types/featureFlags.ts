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

    /** Show option to use custom SQL dimension */
    CustomSqlDimensions = 'custom-sql-dimensions',

    /** Enable dashboard tabs */
    DashboardTabs = 'dashboard_tabs',

    /**
     * Disable https://docs.snowflake.com/en/sql-reference/parameters#label-quoted-identifiers-ignore-case
     * for the Snowflake warehouse client
     */
    DisableSnowflakeQuotedIdentifiersIgnoreCase = 'disable-snowflake-quoted-identifiers-ignore-case',

    PromoteCharts = 'promote-charts',
}
