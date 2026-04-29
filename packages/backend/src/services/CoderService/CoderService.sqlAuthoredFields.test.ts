import { Ability } from '@casl/ability';
import {
    ChartType,
    CustomDimensionType,
    CustomSqlQueryForbiddenError,
    DimensionType,
    OrganizationMemberRole,
    PossibleAbilities,
    TableCalculationType,
    type ChartAsCode,
    type CustomSqlDimension,
    type SqlTableCalculation,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { PromoteService } from '../PromoteService/PromoteService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { CoderService } from './CoderService';

const organizationUuid = 'org-uuid';
const projectUuid = 'project-uuid';

const sqlCustomDim: CustomSqlDimension = {
    id: 'dim-1',
    name: 'Bucketed amount',
    type: CustomDimensionType.SQL,
    table: 'orders',
    sql: 'CASE WHEN x > 0 THEN 1 ELSE 0 END',
    dimensionType: DimensionType.NUMBER,
};

const buildChartAsCode = (
    customDimensions: CustomSqlDimension[] = [],
): ChartAsCode => ({
    name: 'test chart',
    description: '',
    tableName: 'orders',
    slug: 'test-chart',
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
        customDimensions,
    },
    chartConfig: { type: ChartType.CARTESIAN, config: undefined },
    spaceSlug: 'jaffle-shop',
    dashboardSlug: undefined,
    version: 1,
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
        { subject: 'ContentAsCode', action: 'manage' },
    ]),
};

const projectModel = {
    get: jest.fn(async () => ({ projectUuid, organizationUuid })),
};

const savedChartModel = {
    find: jest.fn(async () => []),
};

describe('CoderService.upsertChart — SQL-authored field gate', () => {
    const service = new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: {} as unknown as SavedSqlModel,
        dashboardModel: {} as unknown as DashboardModel,
        spaceModel: {} as unknown as SpaceModel,
        schedulerClient: {} as unknown as SchedulerClient,
        promoteService: {} as unknown as PromoteService,
        spacePermissionService: {} as unknown as SpacePermissionService,
        contentVerificationModel: {} as unknown as ContentVerificationModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('throws CustomSqlQueryForbiddenError when chart contains SQL custom fields and user lacks manage:CustomFields', async () => {
        await expect(
            service.upsertChart(
                userWithoutCustomFields,
                projectUuid,
                'test-chart',
                buildChartAsCode([sqlCustomDim]),
            ),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
        expect(savedChartModel.find).not.toHaveBeenCalled();
    });
});

const sqlTableCalc: SqlTableCalculation = {
    name: 'doubled',
    displayName: 'doubled',
    sql: '${orders.amount} * 2',
    type: TableCalculationType.NUMBER,
};

const buildSavedChart = (
    overrides: {
        customDimensions?: CustomSqlDimension[];
        tableCalculations?: SqlTableCalculation[];
    } = {},
) => ({
    uuid: 'saved-chart-uuid',
    organizationUuid,
    projectUuid,
    spaceUuid: 'space-uuid',
    spaceName: 'space',
    name: 'Naughty chart',
    description: '',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: overrides.tableCalculations ?? [],
        customDimensions: overrides.customDimensions ?? [],
    },
    chartConfig: { type: ChartType.CARTESIAN, config: undefined },
    tableConfig: { columnOrder: [] },
    pinnedListUuid: null,
    pinnedListOrder: null,
    dashboardUuid: null,
    dashboardName: null,
    colorPalette: [],
    slug: 'naughty-chart',
    verification: null,
    updatedAt: new Date(),
});

const adminUserWithoutCustomFields = {
    ...baseUser,
    ability: new Ability<PossibleAbilities>([
        { subject: 'ContentAsCode', action: 'manage' },
        { subject: 'Project', action: 'manage' },
    ]),
};

describe('CoderService.getCharts — SQL-authored field gate', () => {
    const savedChartModelGetCharts = {
        find: jest.fn(async () => [
            { uuid: 'saved-chart-uuid', spaceUuid: 'space-uuid' },
        ]),
        get: jest.fn(async () =>
            buildSavedChart({
                customDimensions: [sqlCustomDim],
                tableCalculations: [sqlTableCalc],
            }),
        ),
        getSlugsForUuids: jest.fn(async () => ['naughty-chart']),
    };

    const dashboardModelMock = {
        getSlugsForUuids: jest.fn(async () => ({})),
    };

    const spaceModelMock = {
        find: jest.fn(async () => [
            {
                uuid: 'space-uuid',
                projectUuid,
                organizationUuid,
                path: 'jaffle_shop',
            },
        ]),
    };

    const contentVerificationModelMock = {
        getByContentUuids: jest.fn(async () => new Map()),
    };

    const service = new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModelGetCharts as unknown as SavedChartModel,
        savedSqlModel: {} as unknown as SavedSqlModel,
        dashboardModel: dashboardModelMock as unknown as DashboardModel,
        spaceModel: spaceModelMock as unknown as SpaceModel,
        schedulerClient: {} as unknown as SchedulerClient,
        promoteService: {} as unknown as PromoteService,
        spacePermissionService: {} as unknown as SpacePermissionService,
        contentVerificationModel:
            contentVerificationModelMock as unknown as ContentVerificationModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('throws CustomSqlQueryForbiddenError listing offending chart names when user lacks manage:CustomFields', async () => {
        await expect(
            service.getCharts(adminUserWithoutCustomFields, projectUuid),
        ).rejects.toThrow(/Naughty chart/);
        expect(
            contentVerificationModelMock.getByContentUuids,
        ).not.toHaveBeenCalled();
    });
});
