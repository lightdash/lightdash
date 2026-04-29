import { Ability } from '@casl/ability';
import {
    CustomDimensionType,
    CustomSqlQueryForbiddenError,
    DimensionType,
    OrganizationMemberRole,
    PossibleAbilities,
    PromotionAction,
    type CustomSqlDimension,
    type PromotionChanges,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { PromoteService } from './PromoteService';
import { promotedChart } from './PromoteService.mock';

const sqlCustomDim: CustomSqlDimension = {
    id: 'dim-1',
    name: 'Bucketed amount',
    type: CustomDimensionType.SQL,
    table: 'orders',
    sql: 'CASE WHEN x > 0 THEN 1 ELSE 0 END',
    dimensionType: DimensionType.NUMBER,
};

const buildPromotionChanges = (
    customDimensions: CustomSqlDimension[],
): PromotionChanges => ({
    spaces: [],
    dashboards: [],
    charts: [
        {
            action: PromotionAction.CREATE,
            data: {
                ...promotedChart.chart,
                metricQuery: {
                    ...promotedChart.chart.metricQuery,
                    customDimensions,
                },
                spaceSlug: 'jaffle-shop',
                spacePath: 'jaffle_shop',
                oldUuid: promotedChart.chart.uuid,
            },
        },
    ],
});

const baseUser = {
    userUuid: 'user-uuid',
    email: 'user@test.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: promotedChart.chart.organizationUuid,
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
    ability: new Ability<PossibleAbilities>([]),
};

describe('PromoteService.upsertCharts — SQL-authored field gate', () => {
    const savedChartModel = {
        update: jest.fn(),
        create: jest.fn(),
        createVersion: jest.fn(),
    };

    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {} as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: {} as unknown as SavedSqlModel,
        spaceModel: {} as unknown as SpaceModel,
        dashboardModel: {} as unknown as DashboardModel,
        spacePermissionService: {} as unknown as SpacePermissionService,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('throws CustomSqlQueryForbiddenError when any chart in the batch has SQL fields and user lacks manage:CustomFields', async () => {
        await expect(
            service.upsertCharts(
                userWithoutCustomFields,
                buildPromotionChanges([sqlCustomDim]),
            ),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
        expect(savedChartModel.create).not.toHaveBeenCalled();
        expect(savedChartModel.update).not.toHaveBeenCalled();
    });

    it('enumerates offending chart names in the error message', async () => {
        const changes = buildPromotionChanges([sqlCustomDim]);
        changes.charts[0].data.name = 'Naughty chart';

        await expect(
            service.upsertCharts(userWithoutCustomFields, changes),
        ).rejects.toThrow(/Naughty chart/);
    });
});
