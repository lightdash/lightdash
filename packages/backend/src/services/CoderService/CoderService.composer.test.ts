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
        { action: 'manage', subject: 'ContentAsCode' },
    ]),
    abilityRules: [],
} as unknown as SessionUser;

type Summary = { uuid: string; name: string; slug: string; spaceUuid: string };
const classicSummary: Summary = {
    uuid: classicChart.uuid,
    name: classicChart.name,
    slug: classicChart.slug,
    spaceUuid: space.uuid,
};
const isComposer = ({ uuid }: Summary) => uuid.startsWith('composer-');

const buildService = ({
    summaries = [classicSummary, composerSummary],
    pageSize = lightdashConfigMock.contentAsCode.maxDownloads,
}: { summaries?: Summary[]; pageSize?: number } = {}) => {
    const savedChartModel = {
        find: vi.fn(async () => summaries),
        findComposerCharts: vi.fn(async (uuids: string[]) =>
            summaries
                .filter(isComposer)
                .filter(({ uuid }) => uuids.includes(uuid))
                .map(({ uuid, name, slug }) => ({ uuid, name, slug })),
        ),
        get: vi.fn(async (uuid: string) => {
            const summary = summaries.find((chart) => chart.uuid === uuid);
            if (!summary || isComposer(summary)) {
                throw new Error(`unexpected read of ${uuid}`);
            }
            return { ...classicChart, ...summary };
        }),
        getSlugsForUuids: vi.fn(async () => []),
        getSlugAliasesForUuids: vi.fn(async () => []),
    };
    const service = new CoderService({
        lightdashConfig: {
            ...lightdashConfigMock,
            contentAsCode: { maxDownloads: pageSize },
        },
        projectModel: {
            get: vi.fn(async () => ({
                projectUuid,
                organizationUuid: 'org-uuid',
            })),
            getSummary: vi.fn(async () => ({
                projectUuid,
                organizationUuid: 'org-uuid',
            })),
        },
        directAccessService: {
            listPoliciesForExport: vi.fn(async () => ({})),
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

    it('pages through the classic charts only, with a total that counts just them', async () => {
        const summary = (uuid: string): Summary => ({
            uuid,
            name: uuid,
            slug: uuid,
            spaceUuid: space.uuid,
        });
        const { service } = buildService({
            summaries: [
                'classic-1',
                'classic-2',
                'composer-1',
                'composer-2',
                'classic-3',
            ].map(summary),
            pageSize: 2,
        });

        const first = await service.getChartsForExport(admin, projectUuid);
        const second = await service.getChartsForExport(
            admin,
            projectUuid,
            undefined,
            first.offset,
        );

        expect(first.charts.map((chart) => chart.slug)).toEqual([
            'classic-1',
            'classic-2',
        ]);
        expect(second.charts.map((chart) => chart.slug)).toEqual(['classic-3']);
        expect([first.total, second.total]).toEqual([3, 3]);
        expect(second.offset).toBe(3);
    });
});
