import {
    CartesianSeriesType,
    ChartType,
    DashboardAsCode,
    type CartesianChartConfig,
    type ChartAsCode,
    type Series,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { vi } from 'vitest';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';
import { testHelpers } from './download';

vi.mock('./dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));

const {
    getDashboardChartSlugs,
    readAiAgentFiles,
    sanitizeChartForDownload,
    shouldDownloadAiAgents,
    upsertVirtualViews,
} = testHelpers;

type LooseDashboard = DashboardAsCode & { needsUpdating: boolean };

const makeLooseDashboard = (
    slug: string,
    chartSlugs: (string | undefined)[],
): LooseDashboard =>
    ({
        slug,
        name: slug,
        spaceSlug: 'test-space',
        version: 1,
        tiles: chartSlugs.map((chartSlug) => ({
            properties: chartSlug ? { chartSlug } : {},
        })),
        needsUpdating: false,
    }) as unknown as LooseDashboard;

const writeFolderDashboard = async (
    baseDir: string,
    slug: string,
    chartSlugs: string[],
) => {
    const tilesYaml = chartSlugs
        .map(
            (s) =>
                `  - properties:\n      chartSlug: ${s}\n    type: saved_chart`,
        )
        .join('\n');
    const yaml = `contentType: dashboard\nname: ${slug}\nslug: ${slug}\nspaceSlug: test-space\ntiles:\n${tilesYaml}\nversion: 1\n`;
    await fs.writeFile(path.join(baseDir, 'dashboards', `${slug}.yml`), yaml);
};

const pivotedSeries = (
    pivotValue: string,
    overrides: Partial<Series> = {},
): Series => ({
    type: CartesianSeriesType.BAR,
    encode: {
        xRef: { field: 'events_date_day' },
        yRef: {
            field: 'orders_count',
            pivotValues: [{ field: 'orders_status', value: pivotValue }],
        },
        x: 'events_date_day',
        y: `orders_count.orders_status.${pivotValue}`,
    },
    ...overrides,
});

const makeChart = (series: Series[]): ChartAsCode =>
    ({
        name: 'pivoted chart',
        slug: 'pivoted-chart',
        spaceSlug: 'test-space',
        tableName: 'orders',
        version: 1,
        metricQuery: {
            additionalMetrics: [],
            customDimensions: [],
            dimensionOverrides: {},
            dimensions: ['orders_status', 'events_date_day'],
            exploreName: 'orders',
            filters: {},
            limit: 500,
            metricOverrides: {},
            metrics: ['orders_count'],
            sorts: [],
            tableCalculations: [],
            timezone: 'project_timezone',
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'events_date_day',
                    yField: ['orders_count'],
                },
                eChartsConfig: {
                    series,
                },
            },
        } satisfies CartesianChartConfig,
        pivotConfig: {
            columns: ['orders_status'],
        },
        dashboardSlug: undefined,
    }) as ChartAsCode;

describe('getDashboardChartSlugs', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'download-test-'));
        await fs.mkdir(path.join(tmpDir, 'dashboards'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('extracts chart slugs from folder dashboards', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', [
            'chart-a',
            'chart-b',
        ]);
        const slugs = await getDashboardChartSlugs([], tmpDir);
        expect(slugs.sort()).toEqual(['chart-a', 'chart-b']);
    });

    it('extracts chart slugs from loose dashboards (PROD-7869 regression)', async () => {
        const loose = makeLooseDashboard('loose-dash', [
            'loose-chart-1',
            'loose-chart-2',
        ]);
        const slugs = await getDashboardChartSlugs([], tmpDir, [loose]);
        expect(slugs.sort()).toEqual(['loose-chart-1', 'loose-chart-2']);
    });

    it('extracts chart slugs from both folder and loose dashboards when unioned', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', ['folder-chart']);
        const loose = makeLooseDashboard('loose-dash', ['loose-chart']);
        const slugs = await getDashboardChartSlugs([], tmpDir, [loose]);
        expect(slugs.sort()).toEqual(['folder-chart', 'loose-chart']);
    });

    it('filters by slug across both folder and loose sources', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', ['folder-chart']);
        const loose = makeLooseDashboard('loose-dash', ['loose-chart']);

        const onlyFolder = await getDashboardChartSlugs(
            ['folder-dash'],
            tmpDir,
            [loose],
        );
        expect(onlyFolder).toEqual(['folder-chart']);

        const onlyLoose = await getDashboardChartSlugs(['loose-dash'], tmpDir, [
            loose,
        ]);
        expect(onlyLoose).toEqual(['loose-chart']);
    });

    it('returns empty array when slug filter matches no dashboards', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', ['folder-chart']);
        const loose = makeLooseDashboard('loose-dash', ['loose-chart']);
        const slugs = await getDashboardChartSlugs(['nonexistent'], tmpDir, [
            loose,
        ]);
        expect(slugs).toEqual([]);
    });

    it('skips tiles without a chartSlug (e.g. markdown, loom)', async () => {
        const loose = makeLooseDashboard('loose-dash', [
            'real-chart',
            undefined,
            undefined,
        ]);
        const slugs = await getDashboardChartSlugs([], tmpDir, [loose]);
        expect(slugs).toEqual(['real-chart']);
    });
});

describe('sanitizeChartForDownload', () => {
    it('preserves per-value pivot series customizations by default', () => {
        const chart = makeChart([
            pivotedSeries('completed', {
                name: 'Completed orders',
                color: '#1f77b4',
                isFilteredOut: false,
            }),
            pivotedSeries('returned', {
                name: 'Returned orders',
                color: '#d62728',
                isFilteredOut: true,
            }),
        ]);

        const result = sanitizeChartForDownload(chart, false);

        expect(result).toBe(chart);
        const series = (result.chartConfig as CartesianChartConfig).config
            ?.eChartsConfig.series;
        expect(series).toHaveLength(2);
        expect(series?.[1]).toEqual(
            expect.objectContaining({
                name: 'Returned orders',
                color: '#d62728',
                isFilteredOut: true,
            }),
        );
        expect(series?.[1].encode.yRef.pivotValues).toEqual([
            { field: 'orders_status', value: 'returned' },
        ]);
    });

    it('strips and dedupes per-value pivot series when requested', () => {
        const chart = makeChart([
            pivotedSeries('completed', {
                name: 'Completed orders',
                color: '#1f77b4',
            }),
            pivotedSeries('returned', {
                name: 'Returned orders',
                color: '#d62728',
            }),
        ]);

        const result = sanitizeChartForDownload(chart, true);

        expect(result).not.toBe(chart);
        const series = (result.chartConfig as CartesianChartConfig).config
            ?.eChartsConfig.series;
        expect(series).toHaveLength(1);
        expect(series?.[0].name).toBeUndefined();
        expect(series?.[0].color).toBeUndefined();
        expect(series?.[0].encode).toEqual({
            xRef: { field: 'events_date_day' },
            yRef: { field: 'orders_count' },
        });
    });
});

describe('upsertVirtualViews', () => {
    let tmpDir: string;
    const virtualView = (slug: string) => `columns:
  - name: order_id
contentType: virtual_view
name: ${slug}
parameters: null
slug: ${slug}
sql: SELECT 1 AS order_id
version: 1
`;

    beforeEach(async () => {
        vi.mocked(lightdashApi).mockReset();
        tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'virtual-views-test-'),
        );
        await fs.mkdir(path.join(tmpDir, 'virtual-views'));
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('continues uploading after one virtual view is denied', async () => {
        await fs.writeFile(
            path.join(tmpDir, 'virtual-views', 'a-denied.yml'),
            virtualView('a-denied'),
        );
        await fs.writeFile(
            path.join(tmpDir, 'virtual-views', 'b-allowed.yml'),
            virtualView('b-allowed'),
        );
        vi.mocked(lightdashApi)
            .mockRejectedValueOnce(new Error('Forbidden'))
            .mockResolvedValueOnce({ action: 'create' } as never);

        const changes = await upsertVirtualViews(
            'project-uuid',
            [],
            {},
            false,
            true,
            tmpDir,
        );

        expect(lightdashApi).toHaveBeenCalledTimes(2);
        expect(changes).toEqual({
            'virtual views with errors': 1,
            'virtual views created': 1,
        });
    });

    it('does not report missing permissions when there are no local virtual views', async () => {
        const logSpy = vi
            .spyOn(GlobalState, 'log')
            .mockImplementation(() => undefined);

        const changes = await upsertVirtualViews(
            'project-uuid',
            [],
            {},
            false,
            false,
            tmpDir,
        );

        expect(changes).toEqual({});
        expect(lightdashApi).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('reports one category error without uploading when local virtual views are forbidden', async () => {
        const logSpy = vi
            .spyOn(GlobalState, 'log')
            .mockImplementation(() => undefined);
        await fs.writeFile(
            path.join(tmpDir, 'virtual-views', 'a-denied.yml'),
            virtualView('a-denied'),
        );
        await fs.writeFile(
            path.join(tmpDir, 'virtual-views', 'b-denied.yml'),
            virtualView('b-denied'),
        );

        const changes = await upsertVirtualViews(
            'project-uuid',
            [],
            {},
            false,
            false,
            tmpDir,
        );

        expect(changes).toEqual({});
        expect(lightdashApi).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledExactlyOnceWith(
            expect.stringContaining('Error uploading virtual views'),
        );
    });
});

describe('readAiAgentFiles', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-code-test-'));
        await fs.mkdir(path.join(tmpDir, 'ai-agents'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('rejects YAML files with an invalid AI agent content type', async () => {
        await fs.writeFile(
            path.join(tmpDir, 'ai-agents', 'invalid.yml'),
            'contentType: ai_agnet\nslug: invalid-agent\n',
        );

        await expect(readAiAgentFiles(tmpDir)).rejects.toThrow(
            'Invalid contentType in AI agent file',
        );
    });
});

describe('shouldDownloadAiAgents', () => {
    it('does not download AI agents by default', () => {
        expect(
            shouldDownloadAiAgents({
                agents: [],
                includeAgents: false,
                includeAll: false,
            }),
        ).toBe(false);
    });

    it.each([
        { agents: [], includeAgents: true, includeAll: false },
        { agents: ['sales-agent'], includeAgents: false, includeAll: false },
        { agents: [], includeAgents: false, includeAll: true },
    ])('downloads AI agents when explicitly selected', (options) => {
        expect(shouldDownloadAiAgents(options)).toBe(true);
    });

    it('does not download AI agents in apps-only mode', () => {
        expect(
            shouldDownloadAiAgents({
                agents: ['sales-agent'],
                includeAgents: true,
                includeAll: true,
                appsOnly: true,
            }),
        ).toBe(false);
    });
});
