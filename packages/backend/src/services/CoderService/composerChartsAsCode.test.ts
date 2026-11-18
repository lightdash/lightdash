import {
    ChartType,
    ContentAsCodeType,
    FieldType,
    QuerySourceType,
    type ComposerChart,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    isComposerChartAsCodeUnchanged,
    toComposerChartAsCode,
} from './composerChartsAsCode';

const stored: ComposerChart = {
    uuid: 'chart-uuid',
    projectUuid: 'project-uuid',
    dashboardUuid: 'dashboard-uuid',
    name: 'Orders by status',
    description: null,
    slug: 'orders-by-status',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    createdByUserUuid: 'user-uuid',
    versionUuid: 'version-uuid',
    pipeline: {
        schemaVersion: 1,
        terminalNodeId: 'orders',
        nodes: [
            {
                sourceType: QuerySourceType.SQL,
                nodeId: 'orders',
                title: 'Orders',
                sql: 'select status, count(*) as n from orders group by 1',
            },
        ],
    },
    chart: {
        schemaVersion: 1,
        columns: [
            { reference: 'status', fieldType: FieldType.DIMENSION },
            { reference: 'n', fieldType: FieldType.METRIC },
        ],
        chartConfig: {
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: 'viz-uuid',
                dataAppVizVersion: 3,
                fieldMapping: { status: 'status' },
            },
        },
        pivotConfig: null,
        tableConfig: { columnOrder: ['status', 'n'] },
    },
    updatedAt: new Date('2026-11-02T00:00:00Z'),
    updatedByUserUuid: 'user-uuid',
};

const download = (vizSlugs = new Map([['viz-uuid', 'status-donut']])) =>
    toComposerChartAsCode(stored, {
        dashboardSlug: 'ops',
        spaceSlug: 'jaffle/ops',
        dataAppVizSlugByUuid: vizSlugs,
    });

// What a YAML file holds after a download: no undefined keys, dates as strings
const asFile = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('composer charts as code', () => {
    it('writes the stored chart verbatim, naming a custom chart type by slug', () => {
        expect(download()).toEqual({
            contentType: ContentAsCodeType.COMPOSER_CHART,
            version: 1,
            slug: 'orders-by-status',
            name: 'Orders by status',
            description: null,
            dashboardSlug: 'ops',
            spaceSlug: 'jaffle/ops',
            pipeline: stored.pipeline,
            chart: {
                ...stored.chart,
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizSlug: 'status-donut',
                        dataAppVizVersion: 3,
                        fieldMapping: { status: 'status' },
                    },
                },
            },
            updatedAt: stored.updatedAt,
            downloadedAt: expect.any(Date),
        });
    });

    it('keeps the uuid of a custom chart type deleted before download', () => {
        expect(download(new Map()).chart.chartConfig).toEqual(
            stored.chart.chartConfig,
        );
    });

    it('treats a downloaded file as unchanged', () => {
        expect(
            isComposerChartAsCodeUnchanged(asFile(download()), download()),
        ).toBe(true);
    });

    it('treats a file without the type version as the version it holds', () => {
        const file = asFile(download());
        if (file.chart.chartConfig.type !== ChartType.DATA_APP_VIZ) {
            throw new Error('expected a custom chart type');
        }
        delete file.chart.chartConfig.config?.dataAppVizVersion;
        expect(isComposerChartAsCodeUnchanged(file, download())).toBe(true);
    });

    it.each([
        ['name', { name: 'Renamed' }],
        ['description', { description: 'New' }],
        [
            'pipeline',
            {
                pipeline: {
                    ...stored.pipeline,
                    nodes: [{ ...stored.pipeline.nodes[0], title: 'Other' }],
                },
            },
        ],
        [
            'chart',
            { chart: { ...download().chart, pivotConfig: { columns: ['n'] } } },
        ],
    ])('sees a changed %s', (_, change) => {
        expect(
            isComposerChartAsCodeUnchanged(
                { ...asFile(download()), ...change },
                download(),
            ),
        ).toBe(false);
    });

    it('ignores the owning dashboard, since an existing chart cannot move', () => {
        expect(
            isComposerChartAsCodeUnchanged(
                { ...asFile(download()), dashboardSlug: 'elsewhere' },
                download(),
            ),
        ).toBe(true);
    });
});
