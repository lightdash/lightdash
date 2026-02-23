/**
 * Consider adding a short description of the feature flag and how it
 * will be used.
 *
 * If the feature flag is no longer in use, remove it from this enum.
 */
export enum FeatureFlags {
    /* Show user groups */
    UserGroupsEnabled = 'user-groups-enabled',

    /* Send local timezone to the warehouse session */
    EnableUserTimezones = 'enable-user-timezones',

    /**
     * Enable dashboard comments
     */
    DashboardComments = 'dashboard-comments-enabled',

    /**
     * Enable scheduler task that replaces custom metrics after project compile
     */
    ReplaceCustomMetricsOnCompile = 'replace-custom-metrics-on-compile',

    /**
     * Enable the dynamic calculation of series color, when not manually set on the chart config.
     * This aims to make the colors more consistent, depending on the groups, but this could cause the opposite effect.
     * For more details, see https://github.com/lightdash/lightdash/issues/13831
     */
    CalculateSeriesColor = 'calculate-series-color',

    /**
     * Enable the ability to write back custom bin dimensions to dbt.
     */
    WriteBackCustomBinDimensions = 'write-back-custom-bin-dimensions',

    /**
     * Enable the ability to show the warehouse execution time and total time in the chart tile.
     */
    ShowExecutionTime = 'show-execution-time',

    /**
     * Enable the ability to create custom visualizations with AI
     */
    AiCustomViz = 'ai-custom-viz',

    /**
     * Use workers for async query execution
     */
    WorkerQueryExecution = 'worker-query-execution',

    /**
     * Enable SQL pivot results conversion to PivotData format
     */
    UseSqlPivotResults = 'use-sql-pivot-results',

    /**
     * Enable map chart type visualization
     */
    Maps = 'maps',

    /**
     * Enable the unused content dashboard showing least viewed charts and dashboards
     */
    UnusedContentDashboard = 'unused-content-dashboard',

    /**
     * Enable viewing and editing YAML source files in the Explore UI
     */
    EditYamlInUi = 'edit-yaml-in-ui',

    /**
     * Enable nested spaces to define their own permissions as well as extending
     * their parent permissions. When disabled (default), all nested spaces
     * inherit permissions from their root space.
     */
    NestedSpacesPermissions = 'nested-spaces-permissions',

    /**
     * Enable admin change notifications for critical configuration changes
     */
    AdminChangeNotifications = 'admin-change-notifications',
    /**
     * Enable saved metrics tree in metrics catalog
     */
    SavedMetricsTree = 'saved-metrics-tree',

    /**
     * Enable default personal spaces for project members
     */
    DefaultUserSpaces = 'default-user-spaces',

    /**
     * Enable stabilized table column widths during virtualized scrolling
     */
    EnableTableColumnWidthStabilization = 'enable-table-column-width-stabilization',
}

export type FeatureFlag = {
    id: string;
    enabled: boolean;
};

export function isFeatureFlags(value: string): value is FeatureFlags {
    return Object.values(FeatureFlags).includes(value as FeatureFlags);
}
