import {
    ApiSqlQueryResults,
    CreateDashboard,
    CreateDashboardChartTile,
    Dashboard,
    DashboardBasicDetails,
    DashboardTileTypes,
    SessionUser,
    UpdateDashboard,
} from 'common';
import { SpaceTable } from '../../database/entities/spaces';
import { ProjectAdapter } from '../../types';

export const user: SessionUser = {
    userUuid: 'userUuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid: 'organizationUuid',
    organizationName: 'organizationName',
    isTrackingAnonymized: false,
    userId: 0,
};

export const expectedSqlResults: ApiSqlQueryResults = {
    rows: [{ col1: 'val1' }],
};

export const projectAdapterMock: ProjectAdapter = {
    compileAllExplores: jest.fn(),
    test: jest.fn(),
    destroy: jest.fn(),
    runQuery: jest.fn(async () => expectedSqlResults.rows),
};
