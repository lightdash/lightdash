/**
 * Consider adding a short description of the feature flag and how it
 * will be used.
 *
 * If the feature flag is no longer in use, remove it from this enum.
 */
export enum FeatureFlags {
    /**
     * Use shared color assignments for cartesian-type charts, when possible. This
     * essentially means we try to have the same dimension translate into the same
     * color in the org's color palette every time.
     */
    UseSharedColorAssignment = 'use-shared-color-assignment',

    /**/
    PassthroughLogin = 'passthrough-login',

    /**
     * Enables custom visualizations when the environment variable is also enabled
     */
    CustomVisualizationsEnabled = 'custom-visualizations-enabled',

    /**/
    ShowDbtCloudProjectOption = 'show-dbt-cloud-project-option',

    /**
     * Use the new in-memory table calculations engine/duckdb
     */
    UseInMemoryTableCalculations = 'new-table-calculations-engine',

    /**
     * Use the new dashboard comments feature. Users can add/resolve/delete comments
     * in a tile. This also includes the new notifications feature.
     */
    DashboardTileComments = 'dashboard-tile-comments',

    /**/
    CustomSQLEnabled = 'custom-sql-enabled',

    /**/
    PuppeteerScrollElementIntoView = 'puppeteer-scroll-element-into-view',
    PuppeteerSetViewportDynamically = 'puppeteer-set-viewport-dynamically',
}
