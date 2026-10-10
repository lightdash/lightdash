import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    buildAgentIdentityClaim,
    DashboardTileTypes,
    FeatureFlags,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { fromSession } from '../../auth/account';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../AiAccessService/agentExecutionContext';
import { DashboardService } from '../DashboardService/DashboardService';
import {
    user as baseUser,
    chart,
    dashboard,
} from '../DashboardService/DashboardService.mock';
import { SavedChartService } from './SavedChartService';

const user: SessionUser = {
    ...baseUser,
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]),
};
const claim = buildAgentIdentityClaim({
    subject: { type: 'user', uuid: user.userUuid },
    surface: AgentActorSurface.MCP,
    clientId: null,
});
const summary = {
    versionUuid: 'old-version',
    createdAt: new Date(),
    createdBy: null,
    agentIdentity: claim,
};
const setup = (enabled: boolean) => {
    const featureFlagModel = { get: vi.fn().mockResolvedValue({ enabled }) };
    const savedChartModel = {
        getSummary: vi.fn().mockResolvedValue(chart),
        get: vi.fn().mockResolvedValue({ ...chart, agentIdentity: claim }),
        getLatestVersionSummary: vi
            .fn()
            .mockResolvedValue({ ...summary, chartUuid: chart.uuid }),
        getVersionSummaryAtTimestamp: vi
            .fn()
            .mockResolvedValue({ ...summary, chartUuid: chart.uuid }),
        getLatestVersionSummaries: vi
            .fn()
            .mockResolvedValue([{ ...summary, chartUuid: chart.uuid }]),
        getVersionSummary: vi
            .fn()
            .mockResolvedValue({ ...summary, chartUuid: chart.uuid }),
        createVersion: vi.fn().mockResolvedValue(chart),
        transaction: vi.fn(async (fn) => fn('transaction')),
        rollbackToVersionAtTimestamp: vi.fn(),
    };
    const dashboardModel = {
        getByIdOrSlug: vi.fn().mockResolvedValue(dashboard),
        getVersionByUuid: vi
            .fn()
            .mockResolvedValue({ ...dashboard, tiles: [] }),
        getLatestVersionSummaries: vi
            .fn()
            .mockResolvedValue([{ ...summary, dashboardUuid: dashboard.uuid }]),
        getVersionSummaryByUuid: vi
            .fn()
            .mockResolvedValue({ ...summary, dashboardUuid: dashboard.uuid }),
        addVersion: vi.fn(),
    };
    const dependencies = {
        featureFlagModel,
        savedChartModel,
        dashboardModel,
        analytics: { track: vi.fn() },
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                inheritsFromOrgOrProject: true,
                access: [],
            }),
        },
        projectModel: {
            getExploreFromCache: vi
                .fn()
                .mockRejectedValue(new Error('No explore')),
        },
    };
    const chartService = new SavedChartService(
        dependencies as unknown as ConstructorParameters<
            typeof SavedChartService
        >[0],
    );
    const dashboardService = new DashboardService(
        dependencies as unknown as ConstructorParameters<
            typeof DashboardService
        >[0],
    );
    return { chartService, dashboardService, ...dependencies };
};

describe('version history agent identity', () => {
    it.each([true, false])(
        'gates chart history and version DTOs when enabled=%s',
        async (enabled) => {
            const { chartService, featureFlagModel } = setup(enabled);
            const history = await chartService.getHistory(user, chart.uuid);
            const version = await chartService.getVersion(
                user,
                chart.uuid,
                'old-version',
            );
            for (const dto of [history.history[0], version]) {
                if (enabled) expect(dto).toHaveProperty('agentIdentity', claim);
                else expect(dto).not.toHaveProperty('agentIdentity');
            }
            expect(featureFlagModel.get).toHaveBeenCalledWith({
                featureFlagId: FeatureFlags.AgentIdentity,
                user: { organizationUuid: chart.organizationUuid },
            });
        },
    );
    it.each([true, false])(
        'gates dashboard history and version DTOs when enabled=%s',
        async (enabled) => {
            const { dashboardService } = setup(enabled);
            const history = await dashboardService.getHistory(
                user,
                dashboard.uuid,
            );
            const version = await dashboardService.getVersion(
                user,
                dashboard.uuid,
                'old-version',
            );
            for (const dto of [history.history[0], version]) {
                if (enabled) expect(dto).toHaveProperty('agentIdentity', claim);
                else expect(dto).not.toHaveProperty('agentIdentity');
            }
        },
    );
    it.each([true, false])(
        'attributes restored dashboards to the current actor (agent=%s)',
        async (agent) => {
            const { dashboardService, dashboardModel } = setup(true);
            const context = createAgentExecutionContext({
                account: fromSession(user),
                surface: AgentActorSurface.IN_APP_AGENT,
                agentUuid: 'current-agent',
                clientId: 'lightdash-chat',
                agentIdentityEnabled: true,
            });
            const restore = () =>
                dashboardService.rollback(user, dashboard.uuid, 'old-version');
            if (agent) await agentExecutionContext.run(context, restore);
            else await restore();
            expect(dashboardModel.addVersion).toHaveBeenCalledWith(
                dashboard.uuid,
                expect.anything(),
                user,
                dashboard.projectUuid,
                'transaction',
                agent ? context.claim : null,
            );
        },
    );
    it.each([true, false])(
        'attributes restored charts to the current actor (agent=%s)',
        async (agent) => {
            const { chartService, savedChartModel } = setup(true);
            const context = createAgentExecutionContext({
                account: fromSession(user),
                surface: AgentActorSurface.IN_APP_AGENT,
                agentUuid: 'current-agent',
                clientId: 'lightdash-chat',
                agentIdentityEnabled: true,
            });
            const restore = () =>
                chartService.rollback(user, chart.uuid, 'old-version');
            if (agent) await agentExecutionContext.run(context, restore);
            else await restore();
            expect(savedChartModel.createVersion).toHaveBeenCalledWith(
                chart.uuid,
                { ...chart, agentIdentity: claim },
                user,
                undefined,
                expect.anything(),
                agent ? context.claim : null,
            );
        },
    );
    it('returns explicit null for historical human versions when enabled', async () => {
        const { chartService, savedChartModel } = setup(true);
        savedChartModel.getVersionSummary.mockResolvedValue({
            ...summary,
            chartUuid: chart.uuid,
            agentIdentity: null,
        });
        expect(
            await chartService.getVersion(user, chart.uuid, 'old-version'),
        ).toHaveProperty('agentIdentity', null);
    });
    it.each([true, false])(
        'gates nested chart versions in dashboard comparisons (enabled=%s)',
        async (enabled) => {
            const { dashboardService, dashboardModel } = setup(enabled);
            dashboardModel.getVersionByUuid.mockResolvedValue({
                ...dashboard,
                tiles: [
                    {
                        uuid: 'tile',
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        w: 1,
                        h: 1,
                        tabUuid: undefined,
                        properties: {
                            savedChartUuid: chart.uuid,
                            belongsToDashboard: true,
                        },
                    },
                ],
            });
            const version = await dashboardService.getVersion(
                user,
                dashboard.uuid,
                'old-version',
            );
            expect(version.chartVersionDifferences).toHaveLength(1);
            const difference = version.chartVersionDifferences![0];
            for (const dto of [
                difference.currentVersion,
                difference.selectedVersion,
            ]) {
                if (enabled) expect(dto).toHaveProperty('agentIdentity', claim);
                else expect(dto).not.toHaveProperty('agentIdentity');
            }
        },
    );
    it.each([true, false])(
        'attributes restored dashboard-owned charts to the restorer (agent=%s)',
        async (agent) => {
            const { dashboardService, dashboardModel, savedChartModel } =
                setup(true);
            dashboardModel.getVersionByUuid.mockResolvedValue({
                ...dashboard,
                tiles: [
                    {
                        uuid: 'tile',
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        w: 1,
                        h: 1,
                        tabUuid: undefined,
                        properties: {
                            savedChartUuid: chart.uuid,
                            belongsToDashboard: true,
                        },
                    },
                ],
            });
            const context = createAgentExecutionContext({
                account: fromSession(user),
                surface: AgentActorSurface.IN_APP_AGENT,
                clientId: 'lightdash-chat',
                agentUuid: 'current-agent',
                agentIdentityEnabled: true,
            });
            const restore = () =>
                dashboardService.rollback(user, dashboard.uuid, 'old-version');
            if (agent) await agentExecutionContext.run(context, restore);
            else await restore();
            expect(
                savedChartModel.rollbackToVersionAtTimestamp,
            ).toHaveBeenCalledWith(
                chart.uuid,
                dashboard.updatedAt,
                user,
                'transaction',
                agent ? context.claim : null,
            );
        },
    );

    it('normalizes legacy claims without mutating the stored version', async () => {
        const { chartService, savedChartModel } = setup(true);
        const legacy = { ...claim, act: { ...claim.act } };
        Reflect.deleteProperty(legacy.act, 'agent_uuid');
        savedChartModel.getVersionSummary.mockResolvedValue({
            ...summary,
            chartUuid: chart.uuid,
            agentIdentity: legacy,
        });
        const version = await chartService.getVersion(
            user,
            chart.uuid,
            'old-version',
        );
        expect(version.agentIdentity?.act.agent_uuid).toBeNull();
        expect(legacy.act).not.toHaveProperty('agent_uuid');
    });
});
