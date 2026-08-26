import { Ability } from '@casl/ability';
import {
    OrganizationMemberRole,
    type PossibleAbilities,
    type SessionUser,
    type SpaceAccess,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
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
import { SavedChartService } from './SavedChartService';

const OWNING_DASHBOARD = 'owning-dashboard-uuid';
const PRIVATE_SPACE = 'private-space-uuid';

// A dashboard-owned chart: no space membership, reachable only via the
// owning dashboard's grants.
const ownedChart = {
    uuid: 'chart-uuid',
    name: 'Owned chart',
    slug: 'owned-chart',
    description: undefined,
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    spaceUuid: PRIVATE_SPACE,
    spaceName: 'PRIVATE',
    dashboardUuid: OWNING_DASHBOARD,
    dashboardName: 'Owning dashboard',
    pinnedListUuid: null,
    pinnedListOrder: null,
    metricQuery: {
        metrics: [],
        dimensions: [],
        filters: { dimensions: {}, metrics: {}, tableCalculations: {} },
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    tableName: 'test_table',
    chartConfig: {
        type: 'cartesian',
        config: { eChartsConfig: { xAxis: [], yAxis: [], series: [] } },
    },
    tableConfig: { columnOrder: [] },
};

// Editor whose only manage path is a grant row in the chart's access array —
// the exact shape a direct dashboard grant produces. No org/project manage.
const grantOnlyEditor = {
    userUuid: 'grant-user-uuid',
    email: 'grant@test.com',
    firstName: 'Grant',
    lastName: 'Only',
    organizationUuid: 'org-uuid',
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    userId: 2,
    role: OrganizationMemberRole.VIEWER,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'SavedChart',
            action: ['view', 'update', 'delete', 'create'],
            conditions: {
                organizationUuid: 'org-uuid',
                access: {
                    $elemMatch: {
                        userUuid: 'grant-user-uuid',
                        role: 'editor',
                    },
                },
            },
        },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
} as unknown as SessionUser;

const grantRow: SpaceAccess = {
    userUuid: 'grant-user-uuid',
    role: 'editor' as SpaceAccess['role'],
    hasDirectAccess: true,
    projectRole: undefined,
    inheritedRole: undefined,
    inheritedFrom: undefined,
    grantedVia: 'dashboard',
};

const grantContext = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    inheritsFromOrgOrProject: false,
    access: [grantRow],
    admins: [],
    directOnly: true,
};

const spaceOnlyContext = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    inheritsFromOrgOrProject: false,
    access: [],
    admins: [],
    directOnly: false,
};

// A space-saved chart reachable only via its OWN direct grant (grantedVia
// 'saved_chart'), the Stack 3A analogue of the dashboard-owned case above.
const spaceChart = {
    ...ownedChart,
    uuid: 'space-chart-uuid',
    name: 'Space chart',
    slug: 'space-chart',
    dashboardUuid: null,
    dashboardName: null,
};

const chartGrantContext = {
    ...grantContext,
    access: [{ ...grantRow, grantedVia: 'saved_chart' as const }],
};

const savedChartModel = {
    getSummary: vi.fn(async () => ownedChart),
    get: vi.fn(async () => ownedChart),
    update: vi.fn(async () => ownedChart),
    delete: vi.fn(async () => ({
        uuid: ownedChart.uuid,
        projectUuid: ownedChart.projectUuid,
    })),
    permanentDelete: vi.fn(async () => ({
        uuid: ownedChart.uuid,
        projectUuid: ownedChart.projectUuid,
    })),
    createVersion: vi.fn(async () => ownedChart),
    updateChartFieldUsage: vi.fn(async () => undefined),
};

const projectModel = {
    getExploreFromCache: vi.fn(async () => null),
    getSummary: vi.fn(async () => ({
        organizationUuid: 'org-uuid',
        projectUuid: 'project-uuid',
    })),
};

const spacePermissionService = {
    getSpaceAccessContext: vi.fn(async () => spaceOnlyContext),
    getDashboardAccessContext: vi.fn(async () => grantContext),
    getChartAccessContext: vi.fn(async () => grantContext),
};

vi.spyOn(analyticsMock, 'track');

describe('SavedChartService direct-grant write parity', () => {
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
        slackClient: {} as never,
        dashboardModel: {} as unknown as DashboardModel,
        catalogModel: {} as unknown as CatalogModel,
        permissionsService: {} as unknown as PermissionsService,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        contentVerificationModel: {
            getByContent: vi.fn(async () => undefined),
            unverify: vi.fn(async () => undefined),
        } as unknown as ContentVerificationModel,
        organizationModel: {} as unknown as OrganizationModel,
    } as never);

    afterEach(() => {
        vi.clearAllMocks();
        spacePermissionService.getChartAccessContext.mockResolvedValue(
            grantContext,
        );
        savedChartModel.getSummary.mockResolvedValue(ownedChart);
        savedChartModel.get.mockResolvedValue(ownedChart);
    });

    it('lets a grant-only editor rename a dashboard-owned chart via the dashboard context', async () => {
        // Field-only edit: no spaceUuid, so it stays inside the dashboard.
        await expect(
            service.update(grantOnlyEditor, ownedChart.uuid, {
                name: 'Renamed',
                description: undefined,
            } as never),
        ).resolves.toBeDefined();
        // The router resolves the OWNING dashboard's grants for an owned chart.
        expect(
            spacePermissionService.getChartAccessContext,
        ).toHaveBeenCalledWith(grantOnlyEditor.userUuid, {
            uuid: ownedChart.uuid,
            dashboardUuid: OWNING_DASHBOARD,
            spaceUuid: PRIVATE_SPACE,
        });
        // Audit records the grant provenance.
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'saved_chart.updated',
                properties: expect.objectContaining({
                    viaDashboardGrant: true,
                    grantOnly: true,
                }),
            }),
        );
    });

    it('denies a grant-only editor from moving the chart via spaceUuid (boundary)', async () => {
        // A truthy spaceUuid would detach + relocate the chart. The grant
        // authorizes the field edit, but the move requires space access to the
        // current space, which a grant-only editor does not have.
        await expect(
            service.update(grantOnlyEditor, ownedChart.uuid, {
                name: 'Renamed',
                description: undefined,
                spaceUuid: 'attacker-space-uuid',
            } as never),
        ).rejects.toThrow('move this chart out of its space');
        expect(
            spacePermissionService.getSpaceAccessContext,
        ).toHaveBeenCalledWith(grantOnlyEditor.userUuid, PRIVATE_SPACE);
    });

    it('denies the update when the context carries no grant (space-only)', async () => {
        spacePermissionService.getChartAccessContext.mockResolvedValue(
            spaceOnlyContext,
        );
        await expect(
            service.update(grantOnlyEditor, ownedChart.uuid, {
                name: 'Renamed',
                description: undefined,
            } as never),
        ).rejects.toThrow('access');
    });

    it('lets a grant-only editor delete a dashboard-owned chart and audits the grant', async () => {
        await expect(
            service.delete(grantOnlyEditor, ownedChart.uuid),
        ).resolves.toBeUndefined();
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'saved_chart.deleted',
                properties: expect.objectContaining({
                    viaDashboardGrant: true,
                    grantOnly: true,
                }),
            }),
        );
    });

    it('denies the delete when the context carries no grant (space-only)', async () => {
        spacePermissionService.getChartAccessContext.mockResolvedValue(
            spaceOnlyContext,
        );
        await expect(
            service.delete(grantOnlyEditor, ownedChart.uuid),
        ).rejects.toThrow();
    });

    it('lets a grant-only editor rename a space-saved chart via its own chart grant', async () => {
        savedChartModel.getSummary.mockResolvedValue(spaceChart as never);
        spacePermissionService.getChartAccessContext.mockResolvedValue(
            chartGrantContext,
        );
        await expect(
            service.update(grantOnlyEditor, spaceChart.uuid, {
                name: 'Renamed in space',
                description: undefined,
            } as never),
        ).resolves.toBeDefined();
        // The router resolves the chart's OWN grant for a space chart.
        expect(
            spacePermissionService.getChartAccessContext,
        ).toHaveBeenCalledWith(grantOnlyEditor.userUuid, {
            uuid: spaceChart.uuid,
            dashboardUuid: null,
            spaceUuid: PRIVATE_SPACE,
        });
        // A saved_chart grant is grant-only but not a dashboard grant.
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'saved_chart.updated',
                properties: expect.objectContaining({
                    viaDashboardGrant: false,
                    grantOnly: true,
                }),
            }),
        );
    });

    it('denies moving a space-saved chart to another space via its chart grant (boundary)', async () => {
        savedChartModel.getSummary.mockResolvedValue(spaceChart as never);
        spacePermissionService.getChartAccessContext.mockResolvedValue(
            chartGrantContext,
        );
        // The chart grant authorizes the edit, but relocating requires space
        // access to the current space, which a grant-only editor lacks.
        await expect(
            service.update(grantOnlyEditor, spaceChart.uuid, {
                name: 'Renamed',
                description: undefined,
                spaceUuid: 'attacker-space-uuid',
            } as never),
        ).rejects.toThrow('move this chart out of its space');
        expect(
            spacePermissionService.getSpaceAccessContext,
        ).toHaveBeenCalledWith(grantOnlyEditor.userUuid, PRIVATE_SPACE);
    });

    it('lets a grant-only editor delete a space-saved chart via its chart grant', async () => {
        savedChartModel.get.mockResolvedValue(spaceChart as never);
        spacePermissionService.getChartAccessContext.mockResolvedValue(
            chartGrantContext,
        );
        await expect(
            service.delete(grantOnlyEditor, spaceChart.uuid),
        ).resolves.toBeUndefined();
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'saved_chart.deleted',
                properties: expect.objectContaining({
                    viaDashboardGrant: false,
                    grantOnly: true,
                }),
            }),
        );
    });
});
