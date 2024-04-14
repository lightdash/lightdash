import { Ability } from '@casl/ability';
import {
    ChartKind,
    CreateDashboard,
    CreateDashboardChartTile,
    DashboardBasicDetails,
    DashboardChartTile,
    DashboardDAO,
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
    tabUuid: undefined,
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
        tableCalculations: [],
    },
    tabs: [],
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
        tableCalculations: [],
    },
    tabs: [],
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
    is_private: false,
    created_at: new Date(),
    project_id: 0,
    organization_uuid: 'organizationUuid',
    search_vector: '',
};
export const savedChartEntry: SavedChartTable['base'] = {
    saved_query_id: 0,
    saved_query_uuid: '123',
    space_id: 0,
    name: 'chart name',
    description: 'My description',
    created_at: new Date(),
    last_version_chart_kind: ChartKind.VERTICAL_BAR,
    last_version_updated_at: new Date(),
    last_version_updated_by_user_uuid: undefined,
    dashboard_uuid: null,
    search_vector: '',
};

export const dashboardEntry: DashboardTable['base'] = {
    dashboard_id: 0,
    dashboard_uuid: 'my_dashboard_uuid',
    name: 'name',
    description: 'description',
    space_id: 0,
    created_at: new Date(),
    search_vector: '',
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
        tableCalculations: [],
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
    pinned_list_uuid: 'pinnedUuid',
    order: 0,
    views: '1',
    first_viewed_at: new Date(1),
};

export const dashboardTileEntry: DashboardTileTable['base'] = {
    dashboard_version_id: 0,
    dashboard_tile_uuid: '2a93d63d-ca81-421c-b88b-1124a2f02407',
    type: DashboardTileTypes.SAVED_CHART,
    x_offset: 5,
    y_offset: 5,
    height: 10,
    width: 10,
    tab_uuid: undefined,
};

export const dashboardTileWithSavedChartEntry = {
    ...dashboardTileEntry,
    saved_query_uuid: '123',
};

export const loomTileEntry = {
    ...dashboardTileEntry,
    type: DashboardTileTypes.LOOM,
    title: 'my loom title',
    url: 'my loom url',
};

export const markdownTileEntry = {
    ...dashboardTileEntry,
    type: DashboardTileTypes.MARKDOWN,
    title: 'my markdown title',
    content: 'my markdown content',
};

export const dashboardChartTileEntry: GetChartTileQuery = {
    dashboard_tile_uuid: 'my-tile',
    saved_query_uuid: savedChartEntry.saved_query_uuid,
};

// Expected returns

export const expectedDashboard: DashboardDAO = {
    organizationUuid: 'organizationUuid',
    projectUuid: projectEntry.project_uuid,
    dashboardVersionId: dashboardVersionEntry.dashboard_version_id,
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
                hideTitle: false,
                title: '',
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
                title: loomTileEntry.title,
                hideTitle: false,
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
                title: markdownTileEntry.title,
                content: markdownTileEntry.content,
                hideTitle: false,
            },
            x: dashboardTileEntry.x_offset,
            y: dashboardTileEntry.y_offset,
            h: dashboardTileEntry.height,
            w: dashboardTileEntry.width,
            // TODO: remove
            tabUuid: 'tabUuid',
        } as DashboardMarkdownTile,
    ],
    filters: {
        dimensions: [],
        metrics: [],
        tableCalculations: [],
    },
    spaceUuid: 'spaceUuid',
    spaceName: 'space name',
    updatedByUser: {
        firstName: 'firstName',
        lastName: 'lastName',
        userUuid: 'userUuid',
    },
    pinnedListUuid: 'pinnedUuid',
    pinnedListOrder: 0,
    views: 1,
    firstViewedAt: new Date(1),
    tabs: [],
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
        spaceUuid: 'spaceUuid',
        pinnedListUuid: 'pinnedUuid',
        pinnedListOrder: 0,
        views: 1,
        firstViewedAt: new Date(1),
        validationErrors: [],
    },
];

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
        { subject: 'Dashboard', action: ['update', 'delete', 'create'] },
    ]),
    isActive: true,
    abilityRules: [],
};
