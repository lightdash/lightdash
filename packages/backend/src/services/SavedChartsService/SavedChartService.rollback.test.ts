import { Ability } from '@casl/ability';
import {
    CustomDimensionType,
    DashboardTileTypes,
    DimensionType,
    ForbiddenError,
    MetricType,
    type AdditionalMetric,
    type MetricQuery,
    type PossibleAbilities,
    type SavedChart,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { fromSession } from '../../auth/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardService } from '../DashboardService/DashboardService';
import {
    user as baseUser,
    chart,
    dashboard,
} from '../DashboardService/DashboardService.mock';
import { SavedChartService } from './SavedChartService';

// The built-in editor: no custom SQL scopes
const editor: SessionUser = {
    ...baseUser,
    ability: new Ability<PossibleAbilities>([
        { action: 'update', subject: 'SavedChart' },
        { action: 'manage', subject: 'Dashboard' },
    ]),
};

const withQuery = (overrides: Partial<MetricQuery>): SavedChart => ({
    ...chart,
    metricQuery: { ...chart.metricQuery, ...overrides },
});

const sqlDimension = {
    id: 'sql_dim',
    name: 'SQL dim',
    table: 'table_name',
    type: CustomDimensionType.SQL,
    sql: "'value'",
    dimensionType: DimensionType.STRING,
} as const;

const sqlTableCalculation = { name: 'sql_tc', displayName: 'SQL', sql: '1' };

const handWrittenMetric: AdditionalMetric = {
    name: 'custom_total',
    label: 'Custom total',
    table: 'table_name',
    type: MetricType.SUM,
    sql: '(SELECT 1)',
};

const setup = (current: SavedChart, restored: SavedChart) => {
    const savedChartModel = {
        getSummary: vi.fn().mockResolvedValue(chart),
        get: vi.fn(async (_uuid: string, versionUuid?: string) =>
            versionUuid ? restored : current,
        ),
        getVersionSummaryAtTimestamp: vi
            .fn()
            .mockResolvedValue({ versionUuid: 'old-version' }),
        lockForVersioning: vi.fn(),
        createVersion: vi.fn().mockResolvedValue(restored),
        transaction: vi.fn(async (fn) => fn('transaction')),
        rollbackToVersionAtTimestamp: vi.fn(),
    };
    const dashboardModel = {
        getByIdOrSlug: vi.fn().mockResolvedValue(dashboard),
        getVersionByUuid: vi.fn().mockResolvedValue({
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
        }),
        addVersion: vi.fn(),
    };
    const projectService = {
        getCustomMetricsNeedingPermission: vi.fn().mockResolvedValue([]),
    };
    const dependencies = {
        lightdashConfig: lightdashConfigMock,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: false }),
        },
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
        getProjectService: () => projectService,
    };
    const chartService = new SavedChartService(
        dependencies as unknown as ConstructorParameters<
            typeof SavedChartService
        >[0],
    );
    const dashboardService = new DashboardService({
        ...dependencies,
        savedChartService: chartService,
    } as unknown as ConstructorParameters<typeof DashboardService>[0]);
    return { chartService, dashboardService, projectService, ...dependencies };
};

describe('restoring a chart version', () => {
    it('refuses a version whose custom SQL dimension the user may not save', async () => {
        const { chartService, savedChartModel } = setup(
            chart,
            withQuery({ customDimensions: [sqlDimension] }),
        );

        await expect(
            chartService.rollback(
                fromSession(editor),
                chart.uuid,
                'old-version',
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(savedChartModel.createVersion).not.toHaveBeenCalled();
    });

    it('refuses a version with a hand-written metric the user may not save', async () => {
        const current = withQuery({ additionalMetrics: [] });
        const restored = withQuery({ additionalMetrics: [handWrittenMetric] });
        const { chartService, savedChartModel, projectService } = setup(
            current,
            restored,
        );
        projectService.getCustomMetricsNeedingPermission.mockResolvedValue([
            handWrittenMetric,
        ]);

        await expect(
            chartService.rollback(
                fromSession(editor),
                chart.uuid,
                'old-version',
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(
            projectService.getCustomMetricsNeedingPermission,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                additionalMetrics: [handWrittenMetric],
                savedAdditionalMetrics: [],
            }),
        );
        expect(savedChartModel.createVersion).not.toHaveBeenCalled();
    });
});

describe('restoring a dashboard', () => {
    it('refuses when a chart it owns would get a SQL table calculation the user may not save', async () => {
        const { dashboardService, dashboardModel, savedChartModel } = setup(
            chart,
            withQuery({ tableCalculations: [sqlTableCalculation] }),
        );

        await expect(
            dashboardService.rollback(
                fromSession(editor),
                dashboard.uuid,
                'old-version',
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(dashboardModel.addVersion).not.toHaveBeenCalled();
        expect(
            savedChartModel.rollbackToVersionAtTimestamp,
        ).not.toHaveBeenCalled();
    });
});
