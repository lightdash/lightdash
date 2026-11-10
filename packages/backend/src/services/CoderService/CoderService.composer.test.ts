import { Ability } from '@casl/ability';
import {
    ChartType,
    PossibleAbilities,
    type AnyType,
    type SavedChartDAO,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CoderService } from './CoderService';

const projectUuid = 'project-uuid';
const space = {
    uuid: 'space-uuid',
    name: 'Reports',
    slug: 'reports',
    path: 'reports',
};
const classicChart: SavedChartDAO = {
    uuid: 'classic-uuid',
    projectUuid,
    organizationUuid: 'org-uuid',
    slug: 'orders-by-status',
    name: 'Orders by status',
    description: undefined,
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.TABLE },
    tableConfig: { columnOrder: [] },
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    spaceUuid: space.uuid,
    spaceName: space.name,
    dashboardUuid: null,
    dashboardName: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    colorPalette: [],
    colorPaletteUuid: null,
    resolvedColorPalette: { colors: [] } as AnyType,
    verification: null,
};
const composerSummary = {
    uuid: 'composer-uuid',
    name: 'Revenue by status',
    slug: 'revenue-by-status',
    spaceUuid: space.uuid,
};
const admin = {
    userUuid: 'admin-uuid',
    organizationUuid: 'org-uuid',
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'Project' },
    ]),
    abilityRules: [],
} as unknown as SessionUser;

const buildService = () => {
    const savedChartModel = {
        find: vi.fn(async () => [
            {
                uuid: classicChart.uuid,
                slug: classicChart.slug,
                spaceUuid: space.uuid,
            },
            composerSummary,
        ]),
        findComposerCharts: vi.fn(async () => [
            {
                uuid: composerSummary.uuid,
                name: composerSummary.name,
                slug: composerSummary.slug,
            },
        ]),
        get: vi.fn(async (uuid: string) => {
            if (uuid !== classicChart.uuid) {
                throw new Error(`unexpected read of ${uuid}`);
            }
            return classicChart;
        }),
        getSlugsForUuids: vi.fn(async () => []),
        getSlugAliasesForUuids: vi.fn(async () => []),
    };
    const service = new CoderService({
        lightdashConfig: lightdashConfigMock,
        projectModel: {
            get: vi.fn(async () => ({
                projectUuid,
                organizationUuid: 'org-uuid',
            })),
        },
        savedChartModel,
        dashboardModel: { getSlugsForUuids: vi.fn(async () => ({})) },
        spaceModel: { find: vi.fn(async () => [space]) },
        contentVerificationModel: {
            getByContentUuids: vi.fn(async () => new Map()),
        },
        appModel: { findAppsByUuids: vi.fn(async () => []) },
    } as AnyType);
    return { service, savedChartModel };
};

describe('content-as-code chart download with a composer chart', () => {
    it('leaves the composer chart out without reporting it missing', async () => {
        const { service } = buildService();

        const results = await service.getChartsForRead(admin, projectUuid, [
            classicChart.slug,
            composerSummary.slug,
        ]);

        expect(results.charts.map((chart) => chart.slug)).toEqual([
            classicChart.slug,
        ]);
        expect(results.missingIds).toEqual([]);
    });
});
