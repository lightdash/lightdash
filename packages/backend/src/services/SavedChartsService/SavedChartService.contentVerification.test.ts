import { Ability } from '@casl/ability';
import {
    ChartType,
    ContentType,
    CustomDimensionType,
    DimensionType,
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
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
    name: 'Orders',
    slug: 'orders',
    description: 'Orders chart',
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
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { subject: 'ContentVerification', action: 'manage' },
        {
            subject: 'SavedChart',
            action: ['view', 'update', 'delete', 'create'],
        },
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
    getSummary: vi.fn(async () => chartSummary),
    get: vi.fn(async () => savedChartData),
    createVersion: vi.fn(async () => savedChartData),
    update: vi.fn(async () => savedChartData),
    create: vi.fn(async () => savedChartData),
};

const contentVerificationModel = {
    verify: vi.fn(async () => undefined),
    unverify: vi.fn(async () => undefined),
    getByContent: vi.fn(async () => verificationInfo),
};

const spacePermissionService = {
    getSpaceAccessContext: vi.fn(async () => ({
        organizationUuid: 'org-uuid',
        projectUuid: 'project-uuid',
        inheritsFromOrgOrProject: true,
        access: [],
    })),
    getFirstViewableSpaceUuid: vi.fn(async () => 'space-uuid'),
};

const projectModel = {
    getExploreFromCache: vi.fn(async () => null),
    getSummary: vi.fn(async () => ({
        organizationUuid: 'org-uuid',
        projectUuid: 'project-uuid',
    })),
};

vi.spyOn(analyticsMock, 'track');

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
        vi.clearAllMocks();
    });

    it('duplicates a chart from its original slug base', async () => {
        await service.duplicate(adminUser, 'project-uuid', 'chart-uuid', {
            chartName: 'Copy of Orders',
            chartDesc: 'Orders chart copy',
        });

        expect(savedChartModel.create).toHaveBeenCalledWith(
            'project-uuid',
            adminUser.userUuid,
            expect.objectContaining({
                name: 'Copy of Orders',
                slug: 'orders',
            }),
        );
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

    describe('custom SQL permissions on create', () => {
        const chartCreator = {
            ...editorUser,
            ability: new Ability<PossibleAbilities>([
                { subject: 'SavedChart', action: 'create' },
            ]),
        };
        const account = fromSession(chartCreator, 'session-cookie');
        const baseChart = {
            name: 'Custom SQL chart',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
            },
            tableConfig: {
                columnOrder: [],
            },
            spaceUuid: 'space-uuid',
            dashboardUuid: null,
        };

        it('rejects custom SQL dimensions without CustomFields permission', async () => {
            await expect(
                service.create(account, 'project-uuid', {
                    ...baseChart,
                    metricQuery: {
                        ...baseChart.metricQuery,
                        customDimensions: [
                            {
                                id: 'custom_sql',
                                name: 'Custom SQL',
                                table: 'orders',
                                type: CustomDimensionType.SQL,
                                sql: "'value'",
                                dimensionType: DimensionType.STRING,
                            },
                        ],
                    },
                }),
            ).rejects.toThrow(
                'User cannot save queries with custom SQL dimensions',
            );

            expect(savedChartModel.create).not.toHaveBeenCalled();
        });

        it('rejects SQL table calculations without CustomSqlTableCalculations permission', async () => {
            await expect(
                service.create(account, 'project-uuid', {
                    ...baseChart,
                    metricQuery: {
                        ...baseChart.metricQuery,
                        tableCalculations: [
                            {
                                name: 'custom_sql',
                                displayName: 'Custom SQL',
                                sql: "'value'",
                            },
                        ],
                    },
                }),
            ).rejects.toThrow(
                'User cannot save queries with SQL table calculations',
            );

            expect(savedChartModel.create).not.toHaveBeenCalled();
        });
    });

    describe('Preserve verification on edit', () => {
        it('should preserve chart verification when admin edits content via createVersion', async () => {
            const result = await service.createVersion(
                adminUser,
                'chart-uuid',
                {
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
                },
            );

            expect(result.verification).toEqual(verificationInfo);
            expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        });

        it('should auto-unverify chart when content is edited with preserveVerification=false', async () => {
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
                preserveVerification: false,
            });

            expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
                ContentType.CHART,
                'chart-uuid',
            );
        });

        it('should preserve chart verification when admin edits metadata via update', async () => {
            const result = await service.update(adminUser, 'chart-uuid', {
                name: 'updated chart name',
            });

            expect(result.verification).toEqual(verificationInfo);
            expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        });

        it('should auto-unverify chart when another editor edits metadata', async () => {
            await service.update(editorUser, 'chart-uuid', {
                name: 'updated chart name',
            });

            expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
                ContentType.CHART,
                'chart-uuid',
            );
        });
    });
});
