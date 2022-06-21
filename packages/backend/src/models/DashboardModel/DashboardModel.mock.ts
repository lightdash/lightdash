import { Ability } from '@casl/ability';
import {
    CreateDashboard,
    CreateDashboardChartTile,
    Dashboard,
    DashboardBasicDetails,
    DashboardChartTile,
    DashboardLoomTile,
    DashboardMarkdownTile,
    DashboardTileTypes,
    DashboardUnversionedFields,
    DashboardVersionedFields,
    OrganizationMemberRole,
    SessionUser,
} from '@lightdash/common';
import {
    DashboardTable,
    DashboardTileTable,
    DashboardVersionTable,
    DashboardViewTable,
} from '../../database/entities/dashboards';
import { ProjectTable } from '../../database/entities/projects';
import { SavedChartTable } from '../../database/entities/savedCharts';
import { SpaceTable } from '../../database/entities/spaces';
import { GetChartTileQuery, GetDashboardQuery } from './DashboardModel';

// Argument mocks
const tileWithoutId: CreateDashboardChartTile = {
    type: DashboardTileTypes.SAVED_CHART,
    x: 4,
    y: 5,
    h: 100,
    w: 200,
    properties: {
        savedChartUuid: '123',
    },
};
const tileWithId: DashboardChartTile = {
    uuid: '2a93d63d-ca81-421c-b88b-1124a2f02407',
    ...tileWithoutId,
};

export const createDashboard: CreateDashboard = {
    name: 'my new dashboard',
    description: 'description',
    tiles: [tileWithoutId],
    filters: {
        dimensions: [],
        metrics: [],
    },
};

export const createDashboardWithTileIds: CreateDashboard = {
    ...createDashboard,
    tiles: [tileWithId],
};

export const addDashboardVersion: DashboardVersionedFields = {
    tiles: [tileWithoutId],
    filters: {
        dimensions: [],
        metrics: [],
    },
};

export const addDashboardVersionWithAllTiles: DashboardVersionedFields = {
    ...addDashboardVersion,
    tiles: [
        tileWithoutId,
        {
            ...tileWithoutId,
            type: DashboardTileTypes.LOOM,
            properties: { title: 'loom title', url: 'loom url' },
        },
        {
            ...tileWithoutId,
            type: DashboardTileTypes.MARKDOWN,
            properties: {
                title: 'markdown title',
                content: 'markdown content',
            },
        },
    ],
};

export const addDashboardVersionWithTileIds: DashboardVersionedFields = {
    ...addDashboardVersion,
    tiles: [tileWithId],
};

export const addDashboardVersionWithoutChart: DashboardVersionedFields = {
    ...addDashboardVersion,
    tiles: [
        {
            ...tileWithoutId,
            properties: {
                savedChartUuid: null,
            },
        },
    ],
};

export const updateDashboard: DashboardUnversionedFields = {
    name: 'my updated dashboard',
    description: 'updated description',
};

// Select mocks
export const projectEntry: Pick<
    ProjectTable['base'],
    'project_id' | 'project_uuid'
> = {
    project_uuid: 'project_uuid',
    project_id: 0,
};

export const spaceEntry: SpaceTable['base'] = {
    space_id: 0,
    space_uuid: '123',
    name: 'space name',
    created_at: new Date(),
    project_id: 0,
    organization_uuid: 'organizationUuid',
};
export const savedChartEntry: SavedChartTable['base'] = {
    saved_query_id: 0,
    saved_query_uuid: '123',
    space_id: 0,
    name: 'chart name',
    description: 'My description',
    created_at: new Date(),
};

export const dashboardEntry: DashboardTable['base'] = {
    dashboard_id: 0,
    dashboard_uuid: 'my_dashboard_uuid',
    name: 'name',
    description: 'description',
    space_id: 0,
    created_at: new Date(),
};

export const dashboardVersionEntry: DashboardVersionTable['base'] = {
    dashboard_version_id: 0,
    dashboard_id: 0,
    created_at: new Date(),
    updated_by_user_uuid: 'userUuid',
};

export const dashboardViewEntry: DashboardViewTable['base'] = {
    dashboard_view_uuid: 'dashboard_view_uuid',
    dashboard_version_id: 0,
    created_at: new Date(),
    name: 'Default',
    filters: {
        dimensions: [],
        metrics: [],
    },
};

export const dashboardWithVersionEntry: GetDashboardQuery = {
    organization_uuid: 'organizationUuid',
    project_uuid: projectEntry.project_uuid,
    dashboard_id: dashboardEntry.dashboard_id,
    dashboard_uuid: dashboardEntry.dashboard_uuid,
    name: dashboardEntry.name,
    description: dashboardEntry.description,
    dashboard_version_id: dashboardVersionEntry.dashboard_version_id,
    created_at: dashboardVersionEntry.created_at,
    user_uuid: 'userUuid',
    first_name: 'firstName',
    last_name: 'lastName',
};

export const dashboardTileEntry: DashboardTileTable['base'] = {
    dashboard_version_id: 0,
    dashboard_tile_uuid: '2a93d63d-ca81-421c-b88b-1124a2f02407',
    type: DashboardTileTypes.SAVED_CHART,
    x_offset: 5,
    y_offset: 5,
    height: 10,
    width: 10,
};

export const dashboardTileWithSavedChartEntry = {
    ...dashboardTileEntry,
    saved_query_uuid: '123',
};

export const loomTileEntry = {
    ...dashboardTileEntry,
    type: DashboardTileTypes.LOOM,
    loomTitle: 'my loom title',
    url: 'my loom url',
};

export const markdownTileEntry = {
    ...dashboardTileEntry,
    type: DashboardTileTypes.MARKDOWN,
    markdownTitle: 'my markdown title',
    content: 'my markdown content',
};

export const dashboardChartTileEntry: GetChartTileQuery = {
    dashboard_tile_uuid: 'my-tile',
    saved_query_uuid: savedChartEntry.saved_query_uuid,
};

// Expected returns

export const expectedDashboard: Dashboard = {
    organizationUuid: 'organizationUuid',
    projectUuid: projectEntry.project_uuid,
    uuid: dashboardEntry.dashboard_uuid,
    name: dashboardEntry.name,
    description: dashboardEntry.description,
    updatedAt: dashboardVersionEntry.created_at,
    tiles: [
        {
            uuid: dashboardTileEntry.dashboard_tile_uuid,
            type: dashboardTileEntry.type,
            properties: {
                savedChartUuid: savedChartEntry.saved_query_uuid,
            },
            x: dashboardTileEntry.x_offset,
            y: dashboardTileEntry.y_offset,
            h: dashboardTileEntry.height,
            w: dashboardTileEntry.width,
        } as DashboardChartTile,
        {
            uuid: dashboardTileEntry.dashboard_tile_uuid,
            type: DashboardTileTypes.LOOM,
            properties: {
                title: loomTileEntry.loomTitle,
                url: loomTileEntry.url,
            },
            x: dashboardTileEntry.x_offset,
            y: dashboardTileEntry.y_offset,
            h: dashboardTileEntry.height,
            w: dashboardTileEntry.width,
        } as DashboardLoomTile,
        {
            uuid: dashboardTileEntry.dashboard_tile_uuid,
            type: DashboardTileTypes.MARKDOWN,
            properties: {
                title: markdownTileEntry.markdownTitle,
                content: markdownTileEntry.content,
            },
            x: dashboardTileEntry.x_offset,
            y: dashboardTileEntry.y_offset,
            h: dashboardTileEntry.height,
            w: dashboardTileEntry.width,
        } as DashboardMarkdownTile,
    ],
    filters: {
        dimensions: [],
        metrics: [],
    },
};

export const expectedAllDashboards: DashboardBasicDetails[] = [
    {
        organizationUuid: 'organizationUuid',
        projectUuid: projectEntry.project_uuid,
        uuid: dashboardEntry.dashboard_uuid,
        name: dashboardEntry.name,
        description: dashboardEntry.description,
        updatedAt: dashboardVersionEntry.created_at,
        updatedByUser: {
            firstName: 'firstName',
            lastName: 'lastName',
            userUuid: 'userUuid',
        },
    },
];

export const user: SessionUser = {
    userUuid: 'userUuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid: 'organizationUuid',
    organizationName: 'organizationName',
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 0,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability([
        { subject: 'Dashboard', action: ['update', 'delete', 'create'] },
    ]),
    isActive: true,
    projectRoles: [],
};
