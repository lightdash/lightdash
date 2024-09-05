import { Ability } from '@casl/ability';
import {
    ChartKind,
    ChartType,
    DashboardChartTile,
    DashboardTileTypes,
    OrganizationMemberRole,
    SessionUser,
} from '@lightdash/common';
import {
    PromotedChart,
    PromotedDashboard,
    UpstreamChart,
    UpstreamDashboard,
} from './PromoteService';

export const user: SessionUser = {
    userUuid: 'userUuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid: 'organizationUuid',
    organizationName: 'organizationName',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 0,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability([
        { subject: 'Project', action: ['update', 'view'] },
        { subject: 'Job', action: ['view'] },
        { subject: 'SqlRunner', action: ['manage'] },
        { subject: 'Explore', action: ['manage'] },
    ]),
    isActive: true,
    abilityRules: [],
};

const updatedByUser = {
    userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
    firstName: 'David',
    lastName: 'Attenborough',
};
const organizationUuid = 'organization-uuid';
const promotedProjectUuid = 'promoted-project-uuid';
const upstreamProjectUuid = 'upstream-project-uuid';

export const promotedSpace: PromotedChart['space'] = {
    organizationUuid,
    projectUuid: promotedProjectUuid,
    uuid: 'promoted-space-uuid',
    name: 'Jaffle shop',
    isPrivate: false,
    access: [],
    pinnedListUuid: null,
    pinnedListOrder: null,
    chartCount: 0,
    dashboardCount: 0,
    slug: 'jaffle-shop',
};

export const upstreamSpace: UpstreamChart['space'] = {
    organizationUuid,
    projectUuid: upstreamProjectUuid,
    uuid: 'upstream-space-uuid',
    name: 'Jaffle shop',
    isPrivate: false,
    access: [],
    pinnedListUuid: null,
    pinnedListOrder: null,
    chartCount: 0,
    dashboardCount: 0,
    slug: 'jaffle-shop',
};

export const promotedChart: PromotedChart = {
    chart: {
        uuid: 'promoted-chart-uuid',
        projectUuid: promotedProjectUuid,
        name: 'apple chart',
        description: '',
        tableName: 'orders',
        updatedAt: new Date(),
        updatedByUser,
        metricQuery: {
            exploreName: 'orders',
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            customDimensions: [],
        },
        chartConfig: { type: ChartType.CARTESIAN, config: undefined },
        tableConfig: { columnOrder: [] },
        organizationUuid,
        spaceUuid: promotedSpace.uuid,
        spaceName: promotedSpace.name,
        pinnedListUuid: null,
        pinnedListOrder: null,
        dashboardUuid: null,
        dashboardName: null,
        colorPalette: [],
        slug: 'apple-chart',
    },
    projectUuid: promotedProjectUuid,
    space: promotedSpace,
    access: [],
};

export const missingUpstreamChart: UpstreamChart = {
    chart: undefined,
    projectUuid: upstreamProjectUuid,
    space: undefined,
    access: [],
};
export const existingUpstreamChart: UpstreamChart = {
    chart: {
        uuid: 'upstream-chart-uuid',
        name: 'apple chart',
        description: '',
        spaceUuid: upstreamSpace.uuid,
        spaceName: upstreamSpace.name,
        projectUuid: upstreamProjectUuid,
        organizationUuid,
        pinnedListUuid: null,
        chartKind: ChartKind.VERTICAL_BAR,
        dashboardUuid: null,
        dashboardName: null,
        updatedAt: new Date(),
        chartType: ChartType.CARTESIAN,
        slug: 'apple-chart',
    },
    projectUuid: upstreamProjectUuid,
    space: upstreamSpace,
    access: [],
};

const dashboardChartTile: DashboardChartTile = {
    uuid: '1234',
    type: DashboardTileTypes.SAVED_CHART,

    x: 0,
    y: 0,
    h: 10,
    w: 10,
    tabUuid: undefined,
    properties: {
        title: 'chart tile',
        savedChartUuid: promotedChart.chart.uuid,
        belongsToDashboard: false,
    },
};

export const promotedDashboard: PromotedDashboard = {
    dashboard: {
        organizationUuid,
        projectUuid: promotedProjectUuid,
        dashboardVersionId: 4,
        uuid: 'promoted-dashboard-uuid',
        name: 'dashboard',
        description: '',
        updatedAt: new Date(),
        pinnedListUuid: null,
        pinnedListOrder: null,
        tiles: [dashboardChartTile],
        tabs: [],
        filters: { metrics: [], dimensions: [], tableCalculations: [] },
        spaceUuid: promotedSpace.uuid,
        spaceName: promotedSpace.name,
        views: 11,
        firstViewedAt: new Date(),
        updatedByUser,
        slug: 'dashboard',
    },
    projectUuid: promotedProjectUuid,
    space: promotedSpace,
    access: [],
};
export const existingUpstreamDashboard: UpstreamDashboard = {
    dashboard: {
        name: 'dashboard',
        description: '',
        uuid: 'upstream-dashboard-uuid',
        spaceUuid: upstreamSpace.uuid,
    },
    projectUuid: upstreamProjectUuid,
    space: upstreamSpace,
    access: [],
};
export const missingUpstreamDashboard: UpstreamDashboard = {
    dashboard: undefined,
    projectUuid: upstreamProjectUuid,
    space: undefined,
    access: [],
};

export const promotedChartWithinDashboard: PromotedChart = {
    ...promotedChart,
    chart: {
        ...promotedChart.chart,
        uuid: 'promoted-chart-within-dashboard-uuid',
        dashboardUuid: 'promoted-dashboard-with-chart-within-dashboard-uuid',
        dashboardName: 'dashboard with chart within dashboard',
    },
};
export const dashboardChartWithinDashboardTile: DashboardChartTile = {
    ...dashboardChartTile,
    properties: {
        title: 'chart within dashboard tile',
        savedChartUuid: promotedChartWithinDashboard.chart.uuid,
        belongsToDashboard: true,
    },
};

export const promotedDashboardWithChartWithinDashboard = {
    ...promotedDashboard,
    dashboard: {
        ...promotedDashboard.dashboard,
        name: 'dashboard with chart within dashboard',
        uuid: 'promoted-dashboard-with-chart-within-dashboard-uuid',
        tiles: [dashboardChartWithinDashboardTile],
    },
};
