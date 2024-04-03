import { Ability } from '@casl/ability';
import {
    ChartType,
    CreateDashboard,
    CreateDashboardChartTile,
    Dashboard,
    DashboardBasicDetails,
    DashboardTileTypes,
    OrganizationMemberRole,
    SavedChart,
    SessionUser,
    Space,
    SpaceMemberRole,
    UpdateDashboard,
} from '@lightdash/common';
import { SpaceTable } from '../../database/entities/spaces';

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
        {
            subject: 'Dashboard',
            action: ['view', 'update', 'delete', 'create'],
        },
        {
            subject: 'Project',
            action: ['manage'],
        },
    ]),
    isActive: true,
    abilityRules: [],
};

export const space: SpaceTable['base'] = {
    space_id: 0,
    space_uuid: '123',
    name: 'space name',
    is_private: true,
    created_at: new Date(),
    project_id: 0,
    organization_uuid: user.organizationUuid!,
    search_vector: '',
};

export const publicSpace: Space = {
    isPrivate: false,
    organizationUuid: 'organizationUuid',
    uuid: 'spaceUuid',
    queries: [],
    projectUuid: 'projectUuid',
    dashboards: [],
    access: [],
    name: '',
    pinnedListUuid: null,
    pinnedListOrder: null,
};
export const privateSpace: Space = {
    ...publicSpace,
    isPrivate: true,
};

export const dashboard: Dashboard = {
    organizationUuid: user.organizationUuid!,
    projectUuid: 'projectUuid',
    uuid: 'uuid',
    name: 'name',
    dashboardVersionId: 1,
    description: 'description',
    updatedAt: new Date(),
    tiles: [
        {
            uuid: 'my-tile',
            type: DashboardTileTypes.SAVED_CHART,
            properties: {
                savedChartUuid: 'savedChartUuid',
                title: 'savedChartName',
            },
            x: 4,
            y: 3,
            h: 2,
            w: 1,
        },
    ],
    filters: {
        dimensions: [],
        metrics: [],
        tableCalculations: [],
    },
    spaceUuid: 'spaceUuid',
    spaceName: 'space name',
    pinnedListUuid: null,
    pinnedListOrder: null,
    views: 1,
    firstViewedAt: new Date(1),
    isPrivate: false,
    access: [],
};

export const chart: SavedChart = {
    uuid: 'chart_uuid',
    projectUuid: dashboard.projectUuid,
    name: 'chart name',
    tableName: 'table_name',
    metricQuery: {
        exploreName: 'table_name',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 0,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.TABLE,
    },
    tableConfig: {
        columnOrder: [],
    },
    updatedAt: new Date(),
    organizationUuid: user.organizationUuid!,
    spaceUuid: 'spaceUuid',
    spaceName: 'space name',
    pinnedListUuid: null,
    pinnedListOrder: null,
    dashboardUuid: dashboard.uuid,
    dashboardName: dashboard.name,
    colorPalette: [],
    isPrivate: false,
    access: [],
};

export const dashboardsDetails: DashboardBasicDetails[] = [
    {
        organizationUuid: user.organizationUuid!,
        projectUuid: dashboard.projectUuid,
        uuid: dashboard.uuid,
        name: dashboard.name,
        description: dashboard.description,
        updatedAt: dashboard.updatedAt,
        spaceUuid: 'spaceUuid',
        pinnedListUuid: null,
        pinnedListOrder: null,
        views: 1,
        firstViewedAt: new Date(1),
    },
];

const createTile: CreateDashboardChartTile = {
    type: DashboardTileTypes.SAVED_CHART,
    x: 4,
    y: 5,
    h: 100,
    w: 200,
    properties: {
        savedChartUuid: '123',
        title: 'title 123',
    },
};

const createTileWithId: CreateDashboardChartTile = {
    ...createTile,
    uuid: 'my-tile',
};

export const createDashboard: CreateDashboard = {
    name: 'my new dashboard',
    description: 'description',
    tiles: [createTile],
    filters: {
        dimensions: [],
        metrics: [],
        tableCalculations: [],
    },
};

export const createDashboardWithTileIds: CreateDashboard = {
    ...createDashboard,
    tiles: [createTileWithId],
};

export const updateDashboard: UpdateDashboard = {
    name: 'my updated dashboard',
    description: 'updated description',
};

export const updateDashboardTiles: UpdateDashboard = {
    tiles: [createTile],
    filters: {
        dimensions: [],
        metrics: [],
        tableCalculations: [],
    },
};

export const updateDashboardTilesWithIds: UpdateDashboard = {
    ...updateDashboardTiles,
    tiles: [createTileWithId],
};

export const updateDashboardDetailsAndTiles: UpdateDashboard = {
    ...updateDashboard,
    ...updateDashboardTiles,
};
