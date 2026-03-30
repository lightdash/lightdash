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

    /* Gate new timezone features: data timezone setting, timezone-aware
       DATE_TRUNC, warehouse session timezone, etc. Temporary — remove once stable. */
    EnableTimezoneSupport = 'enable-timezone-support',

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
     * Enable the unused content dashboard showing least viewed charts and dashboards
     */
    UnusedContentDashboard = 'unused-content-dashboard',

    /**
     * Enable viewing and editing YAML source files in the Explore UI
     */
    EditYamlInUi = 'edit-yaml-in-ui',

    /**
     * Enable saved metrics tree in metrics catalog
     */
    SavedMetricsTree = 'saved-metrics-tree',

    /**
     * Enable default personal spaces for project members
     */
    DefaultUserSpaces = 'default-user-spaces',

    /**
     * Enable Google Chat as a scheduled delivery destination
     */
    GoogleChatEnabled = 'google-chat-enabled',

    /**
     * Enable admin user impersonation. When disabled, impersonation
     * actions are blocked and active sessions are cleared.
     */
    UserImpersonation = 'user-impersonation',

    /**
     * Enable custom group bins for string dimensions
     */
    CustomGroupBins = 'custom-group-bins',

    /**
     * Enable changing the explore a chart points to from the chart UI
     */
    ChangeChartExplore = 'change-chart-explore',

    /**
     * Enable performance optimizations for charts with many series/data points.
     * Switches to canvas renderer, hides overlapping labels, and enables
     * data sampling for line charts when datasets are large.
     */
    LargeChartPerformance = 'large-chart-performance',

    /**
     * Enable content verification (verified seal for charts and dashboards)
     */
    ContentVerification = 'content-verification',

    /**
     * Enable show/hide N rows from start/end of chart data
     */
    ShowHideRows = 'show-hide-rows',

    /**
     * Keep visited dashboard tabs mounted in the DOM (hidden) for instant
     * re-switching. Disabled by default because large dashboards can spike
     * browser memory to 3 GB+ when all tab data stays in memory.
     */
    DashboardTabsInMemory = 'dashboard-tabs-in-memory',

    /**
     * Enable creating and editing metric filters on dashboards.
     * When enabled, the "Add filter" UI includes metrics alongside dimensions.
     * Existing metric filters are always displayed regardless of this flag.
     */
    MetricDashboardFilters = 'metric-dashboard-filters',

    /**
     * Enable user-configurable column limit for pivoted queries
     */
    ShowHideColumns = 'show-hide-columns',
}

export type FeatureFlag = {
    id: string;
    enabled: boolean;
};

export function isFeatureFlags(value: string): value is FeatureFlags {
    return Object.values(FeatureFlags).includes(value as FeatureFlags);
}
