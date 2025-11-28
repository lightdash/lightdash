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

    BigquerySSO = 'bigquery-sso',

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
     * Enable period-over-period comparisons option
     */
    PeriodOverPeriod = 'pop',

    /**
     * Dark mode
     */
    DarkMode = 'dark-mode',
}

export type FeatureFlag = {
    id: string;
    enabled: boolean;
};

export function isFeatureFlags(value: string): value is FeatureFlags {
    return Object.values(FeatureFlags).includes(value as FeatureFlags);
}
