import { Ability } from '@casl/ability';
import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    OrganizationMemberRole,
    PossibleAbilities,
    TableCalculationType,
    type CustomSqlDimension,
    type SqlTableCalculation,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { fromSession } from '../../auth/account';
import { GoogleDriveClient } from '../../clients/Google/GoogleDriveClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { PermissionsService } from '../PermissionsService/PermissionsService';
import { SchedulerService } from '../SchedulerService/SchedulerService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UserService } from '../UserService';
import { SavedChartService } from './SavedChartService';

const organizationUuid = 'org-uuid';
const projectUuid = 'project-uuid';
const spaceUuid = 'space-uuid';
const chartUuid = 'chart-uuid';

const sqlCustomDim: CustomSqlDimension = {
    id: 'dim-1',
    name: 'Bucketed amount',
    type: CustomDimensionType.SQL,
    table: 'orders',
    sql: 'CASE WHEN x > 0 THEN 1 ELSE 0 END',
    dimensionType: DimensionType.NUMBER,
};

const sqlTableCalc: SqlTableCalculation = {
    name: 'doubled',
    displayName: 'doubled',
    sql: '${orders.amount} * 2',
    type: TableCalculationType.NUMBER,
};

const savedChartData = {
    uuid: chartUuid,
    organizationUuid,
    projectUuid,
    spaceUuid,
    spaceName: 'space',
    name: 'apple chart',
    description: '',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [sqlTableCalc],
        customDimensions: [sqlCustomDim],
    },
    chartConfig: { type: ChartType.CARTESIAN, config: undefined },
    tableConfig: { columnOrder: [] },
    pinnedListUuid: null,
    pinnedListOrder: null,
    dashboardUuid: null,
    dashboardName: null,
    colorPalette: [],
    slug: 'apple-chart',
    verification: null,
    updatedAt: new Date(),
};

const baseUser = {
    userUuid: 'user-uuid',
    email: 'user@test.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.VIEWER,
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const userWithoutCustomFields = {
    ...baseUser,
    ability: new Ability<PossibleAbilities>([
        { subject: 'SavedChart', action: ['view'] },
    ]),
};

const userWithCustomFields = {
    ...baseUser,
    ability: new Ability<PossibleAbilities>([
        { subject: 'SavedChart', action: ['view'] },
        { subject: 'CustomFields', action: 'manage' },
    ]),
};

const accountWithout = fromSession(userWithoutCustomFields, 'cookie');
const accountWith = fromSession(userWithCustomFields, 'cookie');

const savedChartModel = {
    get: jest.fn(async () => savedChartData),
};

const spaceModel = {
    getSpaceSummary: jest.fn(async () => ({
        uuid: spaceUuid,
        organizationUuid,
        projectUuid,
    })),
};

const spacePermissionService = {
    getSpaceAccessContext: jest.fn(async () => ({
        organizationUuid,
        projectUuid,
        inheritsFromOrgOrProject: true,
        access: [],
    })),
};

const analyticsModel = {
    addChartViewEvent: jest.fn(async () => {}),
};

describe('SavedChartService.get — SQL-body strip on read', () => {
    const service = new SavedChartService({
        analytics: analyticsMock,
        lightdashConfig: lightdashConfigMock,
        projectModel: {
            getExploreFromCache: jest.fn(async () => null),
        } as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        analyticsModel: analyticsModel as unknown as AnalyticsModel,
        pinnedListModel: {} as unknown as PinnedListModel,
        schedulerModel: {} as unknown as SchedulerModel,
        schedulerService: {} as unknown as SchedulerService,
        schedulerClient: {} as unknown as SchedulerClient,
        slackClient: {} as unknown as SlackClient,
        dashboardModel: {} as unknown as DashboardModel,
        catalogModel: {} as unknown as CatalogModel,
        permissionsService: {} as unknown as PermissionsService,
        googleDriveClient: {} as unknown as GoogleDriveClient,
        userService: {} as unknown as UserService,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        contentVerificationModel: {} as unknown as ContentVerificationModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('strips SQL bodies when caller lacks manage:CustomFields', async () => {
        const result = await service.get(chartUuid, accountWithout);

        expect(result.metricQuery.customDimensions?.[0]).toEqual(
            expect.objectContaining({ sql: '' }),
        );
        expect(result.metricQuery.tableCalculations[0]).toEqual(
            expect.objectContaining({ sql: '' }),
        );
    });

    it('preserves SQL bodies when caller has manage:CustomFields', async () => {
        const result = await service.get(chartUuid, accountWith);

        expect(result.metricQuery.customDimensions?.[0]).toEqual(
            expect.objectContaining({ sql: sqlCustomDim.sql }),
        );
        expect(result.metricQuery.tableCalculations[0]).toEqual(
            expect.objectContaining({ sql: sqlTableCalc.sql }),
        );
    });
});
