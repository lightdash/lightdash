import { Ability } from '@casl/ability';
import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
    TableCalculationType,
    type CreateSavedChartVersion,
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
const savedChartUuid = 'chart-uuid';

const sqlCustomDim: CustomSqlDimension = {
    id: 'dim-1',
    name: 'Bucketed amount',
    type: CustomDimensionType.SQL,
    table: 'orders',
    sql: 'CASE WHEN x > 0 THEN 1 ELSE 0 END',
    dimensionType: DimensionType.NUMBER,
};

const sqlCustomDimModified: CustomSqlDimension = {
    ...sqlCustomDim,
    sql: 'CASE WHEN x > 100 THEN 1 ELSE 0 END',
};

const sqlCustomDimNew: CustomSqlDimension = {
    ...sqlCustomDim,
    id: 'dim-2',
    name: 'Another bucket',
};

const sqlTableCalc: SqlTableCalculation = {
    name: 'doubled',
    displayName: 'doubled',
    sql: '${orders.amount} * 2',
    type: TableCalculationType.NUMBER,
};

const sqlTableCalcModified: SqlTableCalculation = {
    ...sqlTableCalc,
    sql: '${orders.amount} * 3',
};

const sqlTableCalcNew: SqlTableCalculation = {
    ...sqlTableCalc,
    name: 'tripled',
    displayName: 'tripled',
    sql: '${orders.amount} * 3',
};

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

const buildVersion = (
    overrides: Partial<typeof baseMetricQuery> = {},
): CreateSavedChartVersion => ({
    tableName: 'orders',
    metricQuery: { ...baseMetricQuery, ...overrides },
    chartConfig: { type: ChartType.CARTESIAN, config: undefined },
    tableConfig: { columnOrder: [] },
});

const savedChartReturn = {
    uuid: savedChartUuid,
    organizationUuid,
    projectUuid,
    spaceUuid,
    spaceName: 'space',
    pinnedListUuid: null,
    pinnedListOrder: null,
    dashboardUuid: null,
    dashboardName: null,
    name: 'test chart',
    tableName: 'orders',
    chartConfig: { type: ChartType.CARTESIAN, config: undefined },
    tableConfig: { columnOrder: [] },
    colorPalette: [],
    slug: 'test-chart',
    verification: null,
    updatedAt: new Date(),
};

const buildSavedChart = (saved: typeof baseMetricQuery) => ({
    ...savedChartReturn,
    metricQuery: saved,
});

const makeService = (savedMetricQuery: typeof baseMetricQuery) => {
    const savedChartModel = {
        get: jest.fn(async () => buildSavedChart(savedMetricQuery)),
        createVersion: jest.fn(async () => buildSavedChart(savedMetricQuery)),
    };

    const projectModel = {
        getExploreFromCache: jest.fn(async () => null),
    };

    const spacePermissionService = {
        getSpaceAccessContext: jest.fn(async () => ({
            organizationUuid,
            projectUuid,
            inheritsFromOrgOrProject: true,
            access: [],
        })),
    };

    const contentVerificationModel = {
        unverify: jest.fn(async () => undefined),
    };

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
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
    });

    return { service, savedChartModel };
};

describe('SavedChartService.createVersion — SQL custom dimensions', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('allows editor without manage:CustomFields when SQL custom dim is carried over unchanged', async () => {
        const saved = { ...baseMetricQuery, customDimensions: [sqlCustomDim] };
        const { service, savedChartModel } = makeService(saved);

        await expect(
            service.createVersion(
                userWithoutCustomFields,
                savedChartUuid,
                buildVersion({ customDimensions: [sqlCustomDim] }),
            ),
        ).resolves.toBeDefined();

        expect(savedChartModel.createVersion).toHaveBeenCalled();
    });

    it('throws when editor without manage:CustomFields modifies an existing SQL custom dim', async () => {
        const saved = { ...baseMetricQuery, customDimensions: [sqlCustomDim] };
        const { service, savedChartModel } = makeService(saved);

        await expect(
            service.createVersion(
                userWithoutCustomFields,
                savedChartUuid,
                buildVersion({ customDimensions: [sqlCustomDimModified] }),
            ),
        ).rejects.toThrow(
            'User cannot save queries with custom SQL dimensions',
        );

        expect(savedChartModel.createVersion).not.toHaveBeenCalled();
    });

    it('throws when editor without manage:CustomFields adds a new SQL custom dim', async () => {
        const saved = { ...baseMetricQuery, customDimensions: [sqlCustomDim] };
        const { service, savedChartModel } = makeService(saved);

        await expect(
            service.createVersion(
                userWithoutCustomFields,
                savedChartUuid,
                buildVersion({
                    customDimensions: [sqlCustomDim, sqlCustomDimNew],
                }),
            ),
        ).rejects.toThrow(ForbiddenError);

        expect(savedChartModel.createVersion).not.toHaveBeenCalled();
    });

    it('allows admin with manage:CustomFields to add a new SQL custom dim', async () => {
        const saved = { ...baseMetricQuery, customDimensions: [sqlCustomDim] };
        const { service, savedChartModel } = makeService(saved);

        await expect(
            service.createVersion(
                userWithCustomFields,
                savedChartUuid,
                buildVersion({
                    customDimensions: [sqlCustomDim, sqlCustomDimNew],
                }),
            ),
        ).resolves.toBeDefined();

        expect(savedChartModel.createVersion).toHaveBeenCalled();
    });
});

describe('SavedChartService.createVersion — SQL table calculations (gate temporarily dropped)', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('allows editor without manage:CustomFields when SQL TC is carried over unchanged', async () => {
        const saved = { ...baseMetricQuery, tableCalculations: [sqlTableCalc] };
        const { service, savedChartModel } = makeService(saved);

        await expect(
            service.createVersion(
                userWithoutCustomFields,
                savedChartUuid,
                buildVersion({ tableCalculations: [sqlTableCalc] }),
            ),
        ).resolves.toBeDefined();

        expect(savedChartModel.createVersion).toHaveBeenCalled();
    });

    it('allows editor without manage:CustomFields to modify an existing SQL TC (temporary, until convert-to-formula ships)', async () => {
        const saved = { ...baseMetricQuery, tableCalculations: [sqlTableCalc] };
        const { service, savedChartModel } = makeService(saved);

        await expect(
            service.createVersion(
                userWithoutCustomFields,
                savedChartUuid,
                buildVersion({ tableCalculations: [sqlTableCalcModified] }),
            ),
        ).resolves.toBeDefined();

        expect(savedChartModel.createVersion).toHaveBeenCalled();
    });

    it('allows editor without manage:CustomFields to add a new SQL TC (temporary, until convert-to-formula ships)', async () => {
        const saved = { ...baseMetricQuery, tableCalculations: [sqlTableCalc] };
        const { service, savedChartModel } = makeService(saved);

        await expect(
            service.createVersion(
                userWithoutCustomFields,
                savedChartUuid,
                buildVersion({
                    tableCalculations: [sqlTableCalc, sqlTableCalcNew],
                }),
            ),
        ).resolves.toBeDefined();

        expect(savedChartModel.createVersion).toHaveBeenCalled();
    });
});
