import { Ability } from '@casl/ability';
import {
    CreateDashboard,
    CreateDashboardChartTile,
    Dashboard,
    DashboardBasicDetails,
    DashboardTileTypes,
    OrganizationMemberRole,
    SessionUser,
    UpdateDashboard,
} from 'common';
import { SpaceTable } from '../../database/entities/spaces';

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
};

export const space: SpaceTable['base'] = {
    space_id: 0,
    space_uuid: '123',
    name: 'space name',
    created_at: new Date(),
    project_id: 0,
};

export const dashboard: Dashboard = {
    uuid: 'uuid',
    name: 'name',
    description: 'description',
    updatedAt: new Date(),
    tiles: [
        {
            uuid: 'my-tile',
            type: DashboardTileTypes.SAVED_CHART,
            properties: {
                savedChartUuid: 'savedChartUuid',
            },
            x: 4,
            y: 3,
            h: 2,
            w: 1,
        },
    ],
};

export const dashboardsDetails: DashboardBasicDetails[] = [
    {
        uuid: dashboard.uuid,
        name: dashboard.name,
        description: dashboard.description,
        updatedAt: dashboard.updatedAt,
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
};

export const createDashboardWithTileIds: CreateDashboard = {
    name: 'my new dashboard',
    description: 'description',
    tiles: [createTileWithId],
};

export const updateDashboard: UpdateDashboard = {
    name: 'my updated dashboard',
    description: 'updated description',
};

export const updateDashboardTiles: UpdateDashboard = {
    tiles: [createTile],
};

export const updateDashboardTilesWithIds: UpdateDashboard = {
    tiles: [createTileWithId],
};

export const updateDashboardDetailsAndTiles: UpdateDashboard = {
    ...updateDashboard,
    ...updateDashboardTiles,
};
