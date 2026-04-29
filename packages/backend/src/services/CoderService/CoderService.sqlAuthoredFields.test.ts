import { Ability } from '@casl/ability';
import {
    ChartType,
    CustomDimensionType,
    CustomSqlQueryForbiddenError,
    DimensionType,
    OrganizationMemberRole,
    PossibleAbilities,
    type ChartAsCode,
    type CustomSqlDimension,
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
