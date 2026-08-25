import { Ability } from '@casl/ability';
import {
    ChartType,
    ContentAsCodeType,
    OrganizationMemberRole,
    PossibleAbilities,
} from '@lightdash/common'; // pragma: allowlist secret
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock'; // pragma: allowlist secret
import { fromSession } from '../../auth/account';
import { GoogleDriveClient } from '../../clients/Google/GoogleDriveClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock'; // pragma: allowlist secret
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentAsCodeAppliedRevisionModel } from '../../models/ContentAsCodeAppliedRevisionModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { hashContentAsCodeDocument } from '../CoderService/contentAsCodeHash';
import { ContentAsCodeWriteBackService } from '../CoderService/ContentAsCodeWriteBackService';
import { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';
import { PermissionsService } from '../PermissionsService/PermissionsService';
import { SchedulerService } from '../SchedulerService/SchedulerService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UserService } from '../UserService';
import { SavedChartService } from './SavedChartService';

const chartSummary = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    uuid: 'chart-uuid',
    spaceUuid: 'space-uuid',
    metricQuery: {
        metrics: [],
        dimensions: [],
        customDimensions: [],
        tableCalculations: [],
    },
};

const savedChartData = {
    ...chartSummary,
    name: 'Orders',
    slug: 'orders',
    description: 'Orders chart',
    tableName: 'test_table',
    dashboardUuid: null,
    updatedAt: new Date('2026-08-25T12:00:00.000Z'),
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: { eChartsConfig: { xAxis: [], yAxis: [], series: [] } },
    },
    tableConfig: { columnOrder: [] },
    metricQuery: {
        exploreName: 'test',
        metrics: [],
        dimensions: [],
        filters: { dimensions: {}, metrics: {}, tableCalculations: {} },
        sorts: [],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
    },
};

const versionPayload = {
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
};

const developerUser = {
    userUuid: 'user-uuid',
    email: 'dev@test.com',
    firstName: 'Dev',
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
    role: OrganizationMemberRole.DEVELOPER,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'SavedChart',
            action: ['view', 'update', 'delete', 'create'],
        },
        {
            subject: 'SourceCode',
            action: 'manage',
            conditions: { isProtectedBranch: false },
        },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const appliedRevision = {
    contentType: ContentAsCodeType.CHART,
    slug: 'orders',
    contentHash: hashContentAsCodeDocument({
        slug: 'orders',
        name: 'Orders yesterday',
    }),
    snapshot: { slug: 'orders', name: 'Orders yesterday' },
    appliedAt: new Date('2026-08-25T11:00:00.000Z'),
    appliedByUserUuid: 'user-uuid',
};

const spaces = [
    {
        uuid: 'space-uuid',
        name: 'Jaffle shop',
        path: 'jaffle_shop',
    },
];

describe('SavedChartService - content-as-code write-back', () => {
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
        getByContent: vi.fn(async () => null),
        getByContentUuids: vi.fn(async () => new Map()),
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
        getContentAsCodeSyncEnabled: vi.fn(async () => true),
        getContentAsCodeWriteBackEnabled: vi.fn(async () => true),
    };
    const spaceModel = {
        find: vi.fn(async () => spaces),
        getSpaceSummary: vi.fn(async () => ({ uuid: 'space-uuid' })),
        isDefaultUserSpace: vi.fn(async () => false),
    };
    const dashboardModel = {
        getSlugsForUuids: vi.fn(async () => ({})),
    };
    const appliedRevisionModel = {
        findBySlug: vi.fn(),
    };
    const gitIntegrationService = {
        writeBackContentAsCodeFile: vi.fn(),
    };

    const writeBackService = new ContentAsCodeWriteBackService({
        lightdashConfig: lightdashConfigMock,
        projectModel: projectModel as unknown as ProjectModel,
        contentAsCodeAppliedRevisionModel:
            appliedRevisionModel as unknown as ContentAsCodeAppliedRevisionModel,
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        gitIntegrationService:
            gitIntegrationService as unknown as GitIntegrationService,
    });

    const service = new SavedChartService({
        analytics: analyticsMock,
        lightdashConfig: lightdashConfigMock, // pragma: allowlist secret
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        analyticsModel: {
            addChartViewEvent: vi.fn(),
        } as unknown as AnalyticsModel,
        pinnedListModel: {} as unknown as PinnedListModel,
        schedulerModel: {} as unknown as SchedulerModel,
        schedulerService: {} as unknown as SchedulerService,
        schedulerClient: {} as unknown as SchedulerClient,
        slackClient: {} as unknown as SlackClient,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        catalogModel: {} as unknown as CatalogModel,
        permissionsService: {} as unknown as PermissionsService,
        googleDriveClient: {} as unknown as GoogleDriveClient,
        userService: {} as unknown as UserService,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
        organizationModel: {} as unknown as OrganizationModel,
        contentAsCodeWriteBackService: writeBackService,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        appliedRevisionModel.findBySlug.mockResolvedValue(undefined);
        projectModel.getContentAsCodeSyncEnabled.mockResolvedValue(true);
        projectModel.getContentAsCodeWriteBackEnabled.mockResolvedValue(true);
        spaceModel.isDefaultUserSpace.mockResolvedValue(false);
        gitIntegrationService.writeBackContentAsCodeFile.mockResolvedValue({
            prTitle: 'Update chart `orders`',
            prUrl: 'https://example.com/pull/1',
        });
    });

    it('writes managed chart YAML back to git after a UI save', async () => {
        appliedRevisionModel.findBySlug.mockResolvedValue(appliedRevision);

        const result = await service.createVersion(
            fromSession(developerUser, 'session-cookie'),
            'chart-uuid',
            versionPayload,
        );

        expect(result.uuid).toBe('chart-uuid');
        expect(appliedRevisionModel.findBySlug).toHaveBeenCalledWith(
            'project-uuid',
            ContentAsCodeType.CHART,
            'orders',
        );
        expect(
            gitIntegrationService.writeBackContentAsCodeFile,
        ).toHaveBeenCalledTimes(1);
        expect(
            gitIntegrationService.writeBackContentAsCodeFile,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: 'user-uuid' }),
            'project-uuid',
            expect.objectContaining({
                slug: 'orders',
                filePath: 'lightdash/charts/orders.yml',
                title: 'Update chart `orders`',
                description: expect.stringContaining(
                    '/projects/project-uuid/saved/orders',
                ),
            }),
        );
        const [{ content }] =
            gitIntegrationService.writeBackContentAsCodeFile.mock.calls[0].slice(
                2,
            );
        expect(content).toContain('name: Orders');
        expect(content).toContain('slug: orders');
        expect(content).not.toContain('updatedAt');
        expect(content).not.toContain('downloadedAt');
    });

    it('does not write back when write_back is not enabled', async () => {
        appliedRevisionModel.findBySlug.mockResolvedValue(appliedRevision);
        projectModel.getContentAsCodeWriteBackEnabled.mockResolvedValue(false);

        await service.createVersion(
            fromSession(developerUser, 'session-cookie'),
            'chart-uuid',
            versionPayload,
        );

        expect(
            gitIntegrationService.writeBackContentAsCodeFile,
        ).not.toHaveBeenCalled();
    });

    it('does not write back charts in personal spaces', async () => {
        appliedRevisionModel.findBySlug.mockResolvedValue(appliedRevision);
        spaceModel.isDefaultUserSpace.mockResolvedValue(true);

        await service.createVersion(
            fromSession(developerUser, 'session-cookie'),
            'chart-uuid',
            versionPayload,
        );

        expect(
            gitIntegrationService.writeBackContentAsCodeFile,
        ).not.toHaveBeenCalled();
    });

    it('does not write unmanaged charts back to git', async () => {
        const result = await service.createVersion(
            fromSession(developerUser, 'session-cookie'),
            'chart-uuid',
            versionPayload,
        );

        expect(result.uuid).toBe('chart-uuid');
        expect(appliedRevisionModel.findBySlug).toHaveBeenCalledWith(
            'project-uuid',
            ContentAsCodeType.CHART,
            'orders',
        );
        expect(
            gitIntegrationService.writeBackContentAsCodeFile,
        ).not.toHaveBeenCalled();
    });

    it('does not fail the UI save when write-back fails', async () => {
        appliedRevisionModel.findBySlug.mockResolvedValue(appliedRevision);
        gitIntegrationService.writeBackContentAsCodeFile.mockRejectedValue(
            new Error('git unavailable'),
        );

        await expect(
            service.createVersion(
                fromSession(developerUser, 'session-cookie'),
                'chart-uuid',
                versionPayload,
            ),
        ).resolves.toMatchObject({ uuid: 'chart-uuid' });
        expect(
            gitIntegrationService.writeBackContentAsCodeFile,
        ).toHaveBeenCalledTimes(1);
    });
});
