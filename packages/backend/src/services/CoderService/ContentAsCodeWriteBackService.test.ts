import { Ability } from '@casl/ability';
import {
    ChartType,
    ContentAsCodeType,
    DashboardTileTypes,
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    PossibleAbilities,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ContentAsCodeAppliedRevisionModel } from '../../models/ContentAsCodeAppliedRevisionModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';
import {
    hashContentAsCodeDocument,
    toCanonicalContentAsCodeSnapshot,
} from './contentAsCodeHash';
import { ContentAsCodeWriteBackService } from './ContentAsCodeWriteBackService';

const editorUser = {
    userUuid: 'editor-uuid',
    email: 'editor@test.com',
    firstName: 'Biz',
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
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'ContentAsCode',
            action: ['view', 'create'],
        },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const viewerUser = {
    ...editorUser,
    userUuid: 'viewer-uuid',
    email: 'viewer@test.com',
    role: OrganizationMemberRole.VIEWER,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'ContentAsCode',
            action: ['view'],
        },
    ]),
};

const spaces = [
    {
        uuid: 'space-uuid',
        name: 'Jaffle shop',
        path: 'jaffle_shop',
    },
];

const dashboard = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    uuid: 'dashboard-uuid',
    name: 'Weekly KPIs',
    slug: 'weekly-kpis',
    description: null,
    spaceUuid: 'space-uuid',
    updatedAt: new Date('2026-08-25T12:00:00.000Z'),
    tiles: [
        {
            uuid: 'tile-1',
            type: DashboardTileTypes.SAVED_CHART,
            x: 0,
            y: 0,
            h: 3,
            w: 4,
            tabUuid: null,
            properties: {
                savedChartUuid: 'chart-uuid',
                chartSlug: 'orders',
                title: 'Orders',
            },
        },
    ],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    tabs: [],
};

const chart = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    uuid: 'chart-uuid',
    spaceUuid: 'space-uuid',
    name: 'Orders',
    slug: 'orders',
    description: null,
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

describe('ContentAsCodeWriteBackService', () => {
    const projectModel = {
        getSummary: vi.fn(async () => ({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
        })),
        getContentAsCodeSyncEnabled: vi.fn(async () => true),
        getContentAsCodeWriteBackEnabled: vi.fn(async () => true),
    };
    const spaceModel = {
        find: vi.fn(async () => spaces),
        isDefaultUserSpace: vi.fn(async () => false),
    };
    const dashboardModel = {
        getByIdOrSlug: vi.fn(async () => dashboard),
        find: vi.fn(async () => [
            { uuid: dashboard.uuid, slug: dashboard.slug },
        ]),
        getSlugsForUuids: vi.fn(async () => ({})),
    };
    const savedChartModel = {
        find: vi.fn(async () => [{ uuid: chart.uuid, slug: chart.slug }]),
        get: vi.fn(async () => chart),
    };
    const appliedRevisionModel = {
        findBySlug: vi.fn(),
    };
    const contentVerificationModel = {
        getByContentUuids: vi.fn(async () => new Map()),
    };
    const gitIntegrationService = {
        writeBackContentAsCodeFiles: vi.fn(),
        hasOpenContentAsCodePullRequest: vi.fn(async () => false),
        getContentAsCodePullRequestStatus: vi.fn(async (): Promise<{
            prState: 'open' | 'merged' | 'none';
            prUrl: string | null;
            prTitle: string | null;
        }> => ({
            prState: 'none',
            prUrl: null,
            prTitle: null,
        })),
    };

    const service = new ContentAsCodeWriteBackService({
        lightdashConfig: lightdashConfigMock,
        projectModel: projectModel as unknown as ProjectModel,
        contentAsCodeAppliedRevisionModel:
            appliedRevisionModel as unknown as ContentAsCodeAppliedRevisionModel,
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        gitIntegrationService:
            gitIntegrationService as unknown as GitIntegrationService,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        projectModel.getContentAsCodeSyncEnabled.mockResolvedValue(true);
        projectModel.getContentAsCodeWriteBackEnabled.mockResolvedValue(true);
        spaceModel.isDefaultUserSpace.mockResolvedValue(false);
        gitIntegrationService.writeBackContentAsCodeFiles.mockResolvedValue({
            prTitle: 'Update dashboard `weekly-kpis`',
            prUrl: 'https://example.com/pull/2',
        });
        gitIntegrationService.hasOpenContentAsCodePullRequest.mockResolvedValue(
            false,
        );
    });

    it('writes dashboard YAML plus new tile charts after a managed save', async () => {
        appliedRevisionModel.findBySlug.mockImplementation(
            async (_project, contentType) => {
                if (contentType === ContentAsCodeType.DASHBOARD) {
                    return {
                        contentType: ContentAsCodeType.DASHBOARD,
                        slug: 'weekly-kpis',
                        contentHash: hashContentAsCodeDocument({
                            slug: 'weekly-kpis',
                            name: 'Old KPIs',
                        }),
                        snapshot: { tiles: [] },
                        appliedAt: new Date(),
                        appliedByUserUuid: 'user-uuid',
                    };
                }
                return undefined;
            },
        );

        await service.writeBackManagedDashboardIfNeeded(
            editorUser,
            dashboard as never,
            [],
        );

        expect(
            gitIntegrationService.writeBackContentAsCodeFiles,
        ).toHaveBeenCalledTimes(1);
        const payload =
            gitIntegrationService.writeBackContentAsCodeFiles.mock.calls[0][2];
        expect(payload.slug).toBe('weekly-kpis');
        expect(
            payload.files.map((file: { filePath: string }) => file.filePath),
        ).toEqual([
            'lightdash/dashboards/weekly-kpis.yml',
            'lightdash/charts/orders.yml',
        ]);
        expect(payload.description).toContain('/dashboards/weekly-kpis');
    });

    it('notes charts that already have their own open PR instead of duplicating them', async () => {
        appliedRevisionModel.findBySlug.mockResolvedValue({
            contentType: ContentAsCodeType.DASHBOARD,
            slug: 'weekly-kpis',
            contentHash: 'old',
            snapshot: { tiles: [] },
            appliedAt: new Date(),
            appliedByUserUuid: 'user-uuid',
        });
        gitIntegrationService.hasOpenContentAsCodePullRequest.mockResolvedValue(
            true,
        );

        await service.writeBackManagedDashboardIfNeeded(
            editorUser,
            dashboard as never,
            [],
        );

        const payload =
            gitIntegrationService.writeBackContentAsCodeFiles.mock.calls[0][2];
        expect(
            payload.files.map((file: { filePath: string }) => file.filePath),
        ).toEqual(['lightdash/dashboards/weekly-kpis.yml']);
        expect(payload.description).toContain('`orders`');
    });

    it('does not write back unmanaged dashboards on save', async () => {
        appliedRevisionModel.findBySlug.mockResolvedValue(undefined);

        await service.writeBackManagedDashboardIfNeeded(
            editorUser,
            dashboard as never,
            [],
        );

        expect(
            gitIntegrationService.writeBackContentAsCodeFiles,
        ).not.toHaveBeenCalled();
    });

    it('proposes UI-only charts as add-to-git', async () => {
        appliedRevisionModel.findBySlug.mockResolvedValue(undefined);

        const result = await service.proposeContentToGit(
            editorUser,
            'project-uuid',
            ContentAsCodeType.CHART,
            'orders',
        );

        expect(result.prUrl).toBe('https://example.com/pull/2');
        expect(result.filesWritten).toEqual(['lightdash/charts/orders.yml']);
        expect(
            gitIntegrationService.writeBackContentAsCodeFiles,
        ).toHaveBeenCalledWith(
            editorUser,
            'project-uuid',
            expect.objectContaining({
                title: 'Add chart `orders`',
            }),
        );
    });

    it('reports a merged write-back PR as pending next deploy', async () => {
        appliedRevisionModel.findBySlug.mockResolvedValue({
            contentType: ContentAsCodeType.CHART,
            slug: 'orders',
            contentHash: 'stale',
            snapshot: { slug: 'orders' },
            appliedAt: new Date(),
            appliedByUserUuid: 'user-uuid',
        });
        gitIntegrationService.getContentAsCodePullRequestStatus.mockResolvedValue(
            {
                prState: 'merged',
                prUrl: 'https://example.com/pull/9',
                prTitle: 'Update chart `orders`',
            },
        );

        const status = await service.getWriteBackStatus(
            editorUser,
            'project-uuid',
            ContentAsCodeType.CHART,
            'orders',
        );

        expect(status.state).toBe('ahead');
        expect(status.writeBack.prState).toBe('merged');
        expect(status.writeBack.prUrl).toBe('https://example.com/pull/9');
    });

    it('proposes a UI-only dashboard plus tile charts that do not have their own PR', async () => {
        appliedRevisionModel.findBySlug.mockResolvedValue(undefined);

        const result = await service.proposeContentToGit(
            editorUser,
            'project-uuid',
            ContentAsCodeType.DASHBOARD,
            'weekly-kpis',
        );

        expect(result.filesWritten).toEqual([
            'lightdash/dashboards/weekly-kpis.yml',
            'lightdash/charts/orders.yml',
        ]);
        expect(result.notedChartSlugs).toEqual([]);
        expect(
            gitIntegrationService.writeBackContentAsCodeFiles,
        ).toHaveBeenCalledWith(
            editorUser,
            'project-uuid',
            expect.objectContaining({
                title: 'Add dashboard `weekly-kpis`',
            }),
        );
    });

    it('rejects propose when the slug is already in sync', async () => {
        const chartAsCode = await service['buildChartAsCode'](
            chart as never,
            spaces as never,
        );
        appliedRevisionModel.findBySlug.mockResolvedValue({
            contentType: ContentAsCodeType.CHART,
            slug: 'orders',
            contentHash: hashContentAsCodeDocument(
                toCanonicalContentAsCodeSnapshot(chartAsCode),
            ),
            snapshot: { slug: 'orders' },
            appliedAt: new Date(),
            appliedByUserUuid: 'user-uuid',
        });

        await expect(
            service.proposeContentToGit(
                editorUser,
                'project-uuid',
                ContentAsCodeType.CHART,
                'orders',
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(
            gitIntegrationService.writeBackContentAsCodeFiles,
        ).not.toHaveBeenCalled();
    });

    it('forbids propose without create:ContentAsCode', async () => {
        await expect(
            service.proposeContentToGit(
                viewerUser,
                'project-uuid',
                ContentAsCodeType.CHART,
                'orders',
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(
            gitIntegrationService.writeBackContentAsCodeFiles,
        ).not.toHaveBeenCalled();
    });

    it('still returns sync state when git PR status lookup fails', async () => {
        appliedRevisionModel.findBySlug.mockResolvedValue(undefined);
        gitIntegrationService.getContentAsCodePullRequestStatus.mockRejectedValue(
            new Error('github unavailable'),
        );

        const status = await service.getWriteBackStatus(
            editorUser,
            'project-uuid',
            ContentAsCodeType.CHART,
            'orders',
        );

        expect(status.state).toBe('ui_only');
        expect(status.writeBack.prState).toBe('none');
    });
});
