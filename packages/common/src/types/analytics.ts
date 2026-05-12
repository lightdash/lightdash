export type UserWithCount = {
    userUuid: string;
    firstName: string;
    lastName: string;
    count: number | undefined;
};
export type ActivityViews = {
    count: number;
    uuid: string;
    name: string;
};
export type UserActivity = {
    numberUsers: number;
    numberViewers: number;
    numberInteractiveViewers: number;

    numberEditors: number;
    numberAdmins: number;
    numberWeeklyQueryingUsers: number;
    tableMostQueries: UserWithCount[];
    tableMostCreatedCharts: UserWithCount[];
    tableNoQueries: UserWithCount[];
    chartWeeklyQueryingUsers: {
        date: Date;
        num_7d_active_users: string;
        percent_7d_active_users: string;
    }[];
    chartWeeklyAverageQueries: {
        date: Date;
        average_number_of_weekly_queries_per_user: string;
    }[];
    dashboardViews: ActivityViews[];
    userMostViewedDashboards: (UserWithCount & {
        dashboardName: string;
        dashboardUuid: string;
    })[];
    chartViews: ActivityViews[];
};

export type ApiUserActivity = {
    status: 'ok';
    results: UserActivity;
};

export type ApiUserActivityDownloadCsv = {
    results: string; // CSV file URL to download
    status: 'ok';
};

export type UnusedContentItem = {
    lastViewedAt: Date | null;
    lastViewedByUserUuid: string | null;
    lastViewedByUserName: string | null;
    createdByUserUuid: string;
    createdByUserName: string;
    createdAt: Date;
    contentUuid: string;
    contentName: string;
    contentType: 'chart' | 'dashboard';
    viewsCount: number;
};

export type UnusedContent = {
    charts: UnusedContentItem[];
    dashboards: UnusedContentItem[];
};

export type ViewStatistics = {
    views: number;
    firstViewedAt: Date | string | null;
};

export enum QueryExecutionContext {
    DASHBOARD = 'dashboardView',
    AUTOREFRESHED_DASHBOARD = 'autorefreshedDashboard',
    EXPLORE = 'exploreView',
    FILTER_AUTOCOMPLETE = 'filterAutocomplete',
    CHART = 'chartView',
    CHART_HISTORY = 'chartHistory',
    SQL_CHART = 'sqlChartView',
    SQL_RUNNER = 'sqlRunner',
    VIEW_UNDERLYING_DATA = 'viewUnderlyingData',
    ALERT = 'alert',
    SCHEDULED_DELIVERY = 'scheduledDelivery',
    CSV = 'csvDownload',
    GSHEETS = 'gsheets',
    SCHEDULED_GSHEETS_CHART = 'scheduledGsheetsChart',
    SCHEDULED_GSHEETS_DASHBOARD = 'scheduledGsheetsDashboard',
    SCHEDULED_GSHEETS_SQL_CHART = 'scheduledGsheetsSqlChart',
    SCHEDULED_CHART = 'scheduledChart',
    SCHEDULED_DASHBOARD = 'scheduledDashboard',
    CALCULATE_TOTAL = 'calculateTotal',
    CALCULATE_SUBTOTAL = 'calculateSubtotal',
    EMBED = 'embed',
    AI = 'ai',
    MCP_RUN_METRIC_QUERY = 'mcp.run_metric_query',
    MCP_RUN_SQL = 'mcp.run_sql',
    MCP_SEARCH_FIELD_VALUES = 'mcp.search_field_values',
    API = 'api',
    CLI = 'cli',
    METRICS_EXPLORER = 'metricsExplorer',
    PRE_AGGREGATE_MATERIALIZATION = 'preAggregateMaterialization',
    DATA_APP_SAMPLE = 'dataAppSample',
}
