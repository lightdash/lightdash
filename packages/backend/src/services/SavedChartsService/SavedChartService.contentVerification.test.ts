import { Ability } from '@casl/ability';
import {
    ChartType,
    ContentType,
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { GoogleDriveClient } from '../../clients/Google/GoogleDriveClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { OrganizationModel } from '../../models/OrganizationModel';
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

const chartSummary = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    uuid: 'chart-uuid',
};

const verificationInfo = {
    verifiedBy: {
        userUuid: 'user-uuid',
        firstName: 'Test',
        lastName: 'User',
    },
    verifiedAt: new Date(),
};

const savedChartData = {
    ...chartSummary,
    spaceUuid: 'space-uuid',
    metricQuery: {
        metrics: [],
        dimensions: [],
        filters: { dimensions: {}, metrics: {}, tableCalculations: {} },
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    tableName: 'test_table',
    dashboardUuid: null,
    chartConfig: {
        type: 'cartesian',
        config: { eChartsConfig: { xAxis: [], yAxis: [], series: [] } },
    },
    tableConfig: { columnOrder: [] },
};

const adminUser = {
    userUuid: 'user-uuid',
    email: 'admin@test.com',
    firstName: 'Admin',
    lastName: 'User',
    organizationUuid: 'org-uuid',
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { subject: 'ContentVerification', action: 'manage' },
        { subject: 'SavedChart', action: ['view', 'update', 'delete'] },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const editorUser = {
    ...adminUser,
    userUuid: 'editor-uuid',
    email: 'editor@test.com',
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([
        { subject: 'SavedChart', action: ['view', 'update'] },
    ]),
};

const savedChartModel = {
    getSummary: jest.fn(async () => chartSummary),
    get: jest.fn(async () => savedChartData),
    createVersion: jest.fn(async () => savedChartData),
    update: jest.fn(async () => savedChartData),
};

const contentVerificationModel = {
    verify: jest.fn(async () => undefined),
    unverify: jest.fn(async () => undefined),
    getByContent: jest.fn(async () => verificationInfo),
};

const spacePermissionService = {
    getSpaceAccessContext: jest.fn(async () => ({
        organizationUuid: 'org-uuid',
        projectUuid: 'project-uuid',
        inheritsFromOrgOrProject: true,
        access: [],
    })),
};

const projectModel = {
    getExploreFromCache: jest.fn(async () => null),
};

jest.spyOn(analyticsMock, 'track');

describe('SavedChartService - Content Verification', () => {
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
        organizationModel: {} as unknown as OrganizationModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('CASL authorization', () => {
        it('should allow verifyChart when user is admin', async () => {
            const result = await service.verifyChart(adminUser, 'chart-uuid');

            expect(result).toEqual(verificationInfo);
            expect(contentVerificationModel.verify).toHaveBeenCalledWith(
                ContentType.CHART,
                'chart-uuid',
                'project-uuid',
                'user-uuid',
            );
        });

        it('should throw ForbiddenError when user lacks manage:ContentVerification', async () => {
            await expect(
                service.verifyChart(editorUser, 'chart-uuid'),
            ).rejects.toThrow(ForbiddenError);

            await expect(
                service.verifyChart(editorUser, 'chart-uuid'),
            ).rejects.toThrow('Only admins can verify charts');

            expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenError on unverifyChart for non-admin', async () => {
            await expect(
                service.unverifyChart(editorUser, 'chart-uuid'),
            ).rejects.toThrow(ForbiddenError);

            expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        });
    });

    describe('Auto-unverify on edit', () => {
        it('should auto-unverify chart when content is edited via createVersion', async () => {
            await service.createVersion(adminUser, 'chart-uuid', {
                tableName: 'test_table',
                metricQuery: {
                    exploreName: 'test',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                },
                chartConfig: { type: ChartType.CARTESIAN },
                tableConfig: { columnOrder: [] },
            });

            expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
                ContentType.CHART,
                'chart-uuid',
            );
        });

        it('should auto-unverify chart when metadata is edited via update', async () => {
            await service.update(adminUser, 'chart-uuid', {
                name: 'updated chart name',
            });

            expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
                ContentType.CHART,
                'chart-uuid',
            );
        });
    });
});
