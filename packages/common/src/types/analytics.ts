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
    userMostViewedDashboards: (UserWithCount & { dashboardName: string })[];
    chartViews: ActivityViews[];
};

export type ViewStatistics = {
    views: number;
    firstViewedAt: Date | string | null;
};

export enum QueryExecutionContext {
    DASHBOARD = 'dashboardView',
    AUTOREFRESHED_DASHBOARD = 'autorefreshedDashboard',
    EXPLORE = 'exploreView',
    CHART = 'chartView',
    SQL_CHART = 'sqlChartView',
    SQL_RUNNER = 'sqlRunner',
    VIEW_UNDERLYING_DATA = 'viewUnderlyingData',
    ALERT = 'alert',
    SCHEDULED_DELIVERY = 'scheduledDelivery',
    CSV = 'csvDownload',
    GSHEETS = 'gsheets',
    SCHEDULED_GSHEETS_CHART = 'scheduledGsheetsChart',
    SCHEDULED_GSHEETS_DASHBOARD = 'scheduledGsheetsDashboard',
    SCHEDULED_CHART = 'scheduledChart',
    SCHEDULED_DASHBOARD = 'scheduledDashboard',
    CALCULATE_TOTAL = 'calculateTotal',
    API = 'api',
    CLI = 'cli',
    SEMANTIC_VIEWER = 'semanticViewer',
}
