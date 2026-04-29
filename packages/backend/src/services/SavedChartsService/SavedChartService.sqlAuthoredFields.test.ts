import { Ability } from '@casl/ability';
import {
    ChartType,
    CustomDimensionType,
    CustomSqlQueryForbiddenError,
    DimensionType,
    OrganizationMemberRole,
    PossibleAbilities,
    TableCalculationType,
    type CreateSavedChart,
    type CustomSqlDimension,
    type SqlTableCalculation,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
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

const baseMetricQuery = {
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [] as SqlTableCalculation[],
    customDimensions: [] as CustomSqlDimension[],
};

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

const buildChart = (
    overrides: Partial<typeof baseMetricQuery> = {},
): CreateSavedChart => ({
    name: 'test chart',
    tableName: 'orders',
    metricQuery: { ...baseMetricQuery, ...overrides },
    chartConfig: { type: ChartType.CARTESIAN, config: undefined },
    tableConfig: { columnOrder: [] },
    spaceUuid,
    dashboardUuid: null,
});

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
    role: OrganizationMemberRole.EDITOR,
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const userWithoutCustomFields = {
    ...baseUser,
    ability: new Ability<PossibleAbilities>([
        { subject: 'SavedChart', action: ['view', 'create', 'update'] },
    ]),
};

const userWithCustomFields = {
    ...baseUser,
    ability: new Ability<PossibleAbilities>([
        { subject: 'SavedChart', action: ['view', 'create', 'update'] },
        { subject: 'CustomFields', action: 'manage' },
    ]),
};

const savedChartModel = {
    create: jest.fn(async () => ({
        ...buildChart(),
        uuid: 'chart-uuid',
        organizationUuid,
        projectUuid,
        spaceUuid,
        spaceName: 'space',
        pinnedListUuid: null,
        pinnedListOrder: null,
        dashboardUuid: null,
        dashboardName: null,
        colorPalette: [],
        slug: 'test-chart',
        verification: null,
        updatedAt: new Date(),
    })),
};

const projectModel = {
    getSummary: jest.fn(async () => ({ organizationUuid, projectUuid })),
    getExploreFromCache: jest.fn(async () => null),
};

const spacePermissionService = {
    getFirstViewableSpaceUuid: jest.fn(async () => spaceUuid),
    getSpaceAccessContext: jest.fn(async () => ({
        organizationUuid,
        projectUuid,
        inheritsFromOrgOrProject: true,
        access: [],
    })),
};

describe('SavedChartService.create — SQL-authored field gate', () => {
    const service = new SavedChartService({
        analytics: analyticsMock,
        lightdashConfig: lightdashConfigMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        spaceModel: {} as unknown as SpaceModel,
        analyticsModel: {} as unknown as AnalyticsModel,
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

    it('throws CustomSqlQueryForbiddenError when chart contains a SQL custom dimension and user lacks manage:CustomFields', async () => {
        await expect(
            service.create(
                userWithoutCustomFields,
                projectUuid,
                buildChart({ customDimensions: [sqlCustomDim] }),
            ),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
        expect(savedChartModel.create).not.toHaveBeenCalled();
    });

    it('throws CustomSqlQueryForbiddenError when chart contains a SQL table calculation and user lacks manage:CustomFields', async () => {
        await expect(
            service.create(
                userWithoutCustomFields,
                projectUuid,
                buildChart({ tableCalculations: [sqlTableCalc] }),
            ),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
        expect(savedChartModel.create).not.toHaveBeenCalled();
    });

    it('allows creation when user has manage:CustomFields', async () => {
        await expect(
            service.create(
                userWithCustomFields,
                projectUuid,
                buildChart({ customDimensions: [sqlCustomDim] }),
            ),
        ).resolves.toBeDefined();
        expect(savedChartModel.create).toHaveBeenCalled();
    });
});
