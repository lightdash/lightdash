import { Ability } from '@casl/ability';
import {
    ChartKind,
    ChartSourceType,
    ChartType,
    ContentType,
    FeatureFlags,
    OrganizationMemberRole,
    type DashboardBasicDetails,
    type PossibleAbilities,
    type SessionUser,
    type SpaceQuery,
} from '@lightdash/common';
import type { ContentVerificationModel } from '../../models/ContentVerificationModel';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { SpaceModel } from '../../models/SpaceModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { ProjectService, type ProjectServiceArguments } from './ProjectService';

const projectUuid = 'test-project-uuid';
const orgUuid = 'test-org-uuid';

const adminUser: SessionUser = {
    userUuid: 'user-uuid',
    email: 'admin@test.com',
    firstName: 'Admin',
    lastName: 'User',
    organizationUuid: orgUuid,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { subject: 'Project', action: 'view' },
        { subject: 'ContentVerification', action: 'manage' },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const makeSqlChart = (uuid: string): SpaceQuery => ({
    uuid,
    name: `SQL Chart ${uuid}`,
    spaceName: 'Test Space',
    spaceUuid: 'space-uuid',
    projectUuid,
    organizationUuid: orgUuid,
    pinnedListUuid: null,
    pinnedListOrder: null,
    dashboardUuid: null,
    dashboardName: null,
    slug: `sql-chart-${uuid}`,
    updatedAt: new Date(),
    updatedByUser: {
        userUuid: 'user-uuid',
        firstName: 'Admin',
        lastName: 'User',
    },
    chartType: ChartType.CARTESIAN,
    chartKind: ChartKind.VERTICAL_BAR,
    views: 0,
    firstViewedAt: null,
    validationErrors: [],
    source: ChartSourceType.SQL,
    verification: null,
});

const makeDbtChart = (uuid: string): SpaceQuery => ({
    ...makeSqlChart(uuid),
    name: `dbt Chart ${uuid}`,
    slug: `dbt-chart-${uuid}`,
    source: ChartSourceType.DBT_EXPLORE,
});

const makeDashboard = (uuid: string): DashboardBasicDetails => ({
    uuid,
    name: `Dashboard ${uuid}`,
    description: 'Test dashboard',
    updatedAt: new Date(),
    projectUuid,
    updatedByUser: {
        userUuid: 'user-uuid',
        firstName: 'Admin',
        lastName: 'User',
    },
    organizationUuid: orgUuid,
    spaceUuid: 'space-uuid',
    views: 0,
    firstViewedAt: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    validationErrors: [],
    verification: null,
});

const contentVerificationModel = {
    getVerifiedContentUuidsForProject: jest.fn(),
    getAllForProject: jest.fn(),
    getByContent: jest.fn(),
    getByContentUuids: jest.fn(),
    verify: jest.fn(),
    unverify: jest.fn(),
};

const featureFlagModel = {
    get: jest.fn(),
};

const projectModel = {
    getSummary: jest.fn(async () => ({
        organizationUuid: orgUuid,
        projectUuid,
    })),
};

const spaceModel = {
    find: jest.fn(),
    getSpaceQueries: jest.fn(),
    getSpaceSqlCharts: jest.fn(),
    getSpaceDashboards: jest.fn(),
};

const spacePermissionService = {
    getAccessibleSpaceUuids: jest.fn(
        async (_action: string, _user: unknown, uuids: string[]) => uuids,
    ),
};

function createService() {
    return new ProjectService({
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
        featureFlagModel: featureFlagModel as unknown as FeatureFlagModel,
        projectModel: projectModel as unknown as ProjectModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    } as unknown as ProjectServiceArguments);
}

describe('getVerifiedContentForHomepage', () => {
    let service: ProjectService;

    beforeEach(() => {
        jest.clearAllMocks();
        featureFlagModel.get.mockResolvedValue({
            id: FeatureFlags.ContentVerification,
            enabled: true,
        });
        spaceModel.find.mockResolvedValue([{ uuid: 'space-uuid' }]);
        spaceModel.getSpaceQueries.mockResolvedValue([]);
        spaceModel.getSpaceSqlCharts.mockResolvedValue([]);
        spaceModel.getSpaceDashboards.mockResolvedValue([]);
        service = createService();
    });

    it('should return verified SQL charts (Test Case 1)', async () => {
        const sqlChartUuid = 'sql-chart-uuid';
        const dashboardUuid = 'dashboard-uuid';

        contentVerificationModel.getVerifiedContentUuidsForProject.mockResolvedValue(
            [
                {
                    contentType: ContentType.CHART,
                    contentUuid: sqlChartUuid,
                },
                {
                    contentType: ContentType.DASHBOARD,
                    contentUuid: dashboardUuid,
                },
            ],
        );
        spaceModel.getSpaceQueries.mockResolvedValue([]);
        spaceModel.getSpaceSqlCharts.mockResolvedValue([
            makeSqlChart(sqlChartUuid),
        ]);
        spaceModel.getSpaceDashboards.mockResolvedValue([
            makeDashboard(dashboardUuid),
        ]);

        const result = await service.getVerifiedContentForHomepage(
            adminUser,
            projectUuid,
        );

        expect(result).toHaveLength(2);
        expect(result.map((r) => r.uuid)).toEqual(
            expect.arrayContaining([sqlChartUuid, dashboardUuid]),
        );
    });

    it('should return all content types — dbt chart + SQL chart + dashboard (Test Case 2)', async () => {
        const dbtChartUuid = 'dbt-chart-uuid';
        const sqlChartUuid = 'sql-chart-uuid';
        const dashboardUuid = 'dashboard-uuid';

        contentVerificationModel.getVerifiedContentUuidsForProject.mockResolvedValue(
            [
                {
                    contentType: ContentType.CHART,
                    contentUuid: dbtChartUuid,
                },
                {
                    contentType: ContentType.CHART,
                    contentUuid: sqlChartUuid,
                },
                {
                    contentType: ContentType.DASHBOARD,
                    contentUuid: dashboardUuid,
                },
            ],
        );
        spaceModel.getSpaceQueries.mockResolvedValue([
            makeDbtChart(dbtChartUuid),
        ]);
        spaceModel.getSpaceSqlCharts.mockResolvedValue([
            makeSqlChart(sqlChartUuid),
        ]);
        spaceModel.getSpaceDashboards.mockResolvedValue([
            makeDashboard(dashboardUuid),
        ]);

        const result = await service.getVerifiedContentForHomepage(
            adminUser,
            projectUuid,
        );

        expect(result).toHaveLength(3);
        expect(result.map((r) => r.uuid)).toEqual(
            expect.arrayContaining([dbtChartUuid, sqlChartUuid, dashboardUuid]),
        );
    });

    it('should gracefully filter out stale verification rows (Test Case 3)', async () => {
        const existingChartUuid = 'existing-chart';
        const staleChartUuid = 'stale-deleted-chart';

        contentVerificationModel.getVerifiedContentUuidsForProject.mockResolvedValue(
            [
                {
                    contentType: ContentType.CHART,
                    contentUuid: existingChartUuid,
                },
                {
                    contentType: ContentType.CHART,
                    contentUuid: staleChartUuid,
                },
            ],
        );
        spaceModel.getSpaceQueries.mockResolvedValue([
            makeDbtChart(existingChartUuid),
        ]);
        spaceModel.getSpaceSqlCharts.mockResolvedValue([]);

        const result = await service.getVerifiedContentForHomepage(
            adminUser,
            projectUuid,
        );

        expect(result).toHaveLength(1);
        expect(result[0].uuid).toBe(existingChartUuid);
    });

    it('should return empty when feature flag is disabled (Test Case 4)', async () => {
        featureFlagModel.get.mockResolvedValue({
            id: FeatureFlags.ContentVerification,
            enabled: false,
        });

        const result = await service.getVerifiedContentForHomepage(
            adminUser,
            projectUuid,
        );

        expect(result).toEqual([]);
        expect(
            contentVerificationModel.getVerifiedContentUuidsForProject,
        ).not.toHaveBeenCalled();
    });

    it('should return empty when no content is verified (Test Case 5)', async () => {
        contentVerificationModel.getVerifiedContentUuidsForProject.mockResolvedValue(
            [],
        );

        const result = await service.getVerifiedContentForHomepage(
            adminUser,
            projectUuid,
        );

        expect(result).toEqual([]);
        expect(spaceModel.getSpaceQueries).not.toHaveBeenCalled();
        expect(spaceModel.getSpaceSqlCharts).not.toHaveBeenCalled();
        expect(spaceModel.getSpaceDashboards).not.toHaveBeenCalled();
    });

    it('should exclude verified content in inaccessible spaces (Test Case 6)', async () => {
        contentVerificationModel.getVerifiedContentUuidsForProject.mockResolvedValue(
            [
                {
                    contentType: ContentType.CHART,
                    contentUuid: 'chart-in-private-space',
                },
            ],
        );
        spacePermissionService.getAccessibleSpaceUuids.mockResolvedValue([]);
        spaceModel.getSpaceQueries.mockResolvedValue([]);
        spaceModel.getSpaceSqlCharts.mockResolvedValue([]);

        const result = await service.getVerifiedContentForHomepage(
            adminUser,
            projectUuid,
        );

        expect(result).toEqual([]);
        expect(spaceModel.getSpaceQueries).toHaveBeenCalledWith([]);
        expect(spaceModel.getSpaceSqlCharts).toHaveBeenCalledWith([]);
    });
});
