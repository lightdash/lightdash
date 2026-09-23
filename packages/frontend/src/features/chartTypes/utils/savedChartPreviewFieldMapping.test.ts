import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    type DataAppVizField,
    type ItemsMap,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    mapSavedChartPreviewFields,
    type SavedChartBindingSource,
} from './savedChartPreviewFieldMapping';

const dimension = (name: string) => ({
    fieldType: FieldType.DIMENSION as const,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: name,
    hidden: false,
});
const metric = (name: string) => ({
    ...dimension(name),
    fieldType: FieldType.METRIC as const,
    type: MetricType.SUM,
});
const itemsMap: ItemsMap = {
    orders_status: dimension('status'),
    orders_region: dimension('region'),
    orders_date: dimension('date'),
    orders_tax: metric('tax'),
    orders_revenue: metric('revenue'),
    orders_profit: metric('profit'),
};
const fields: DataAppVizField[] = [
    { name: 'category', label: 'Category', type: 'dimension', required: true },
    { name: 'split', label: 'Split', type: 'series', required: true },
    { name: 'value', label: 'Value', type: 'metric', required: true },
];
const chart: SavedChartBindingSource = {
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status', 'orders_region', 'orders_date'],
        metrics: ['orders_tax', 'orders_revenue', 'orders_profit'],
        tableCalculations: [],
        filters: {},
        sorts: [],
        limit: 100,
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'orders_date', yField: ['orders_revenue'] },
            eChartsConfig: {},
        },
    },
    pivotConfig: { columns: ['orders_region'] },
};
const build = (
    sourceChart: SavedChartBindingSource | null = chart,
    targetFields = fields,
    dataAppVizUuid = 'target-viz',
) =>
    mapSavedChartPreviewFields({
        fields: targetFields,
        itemsMap,
        sourceChart,
        dataAppVizUuid,
    });

describe('mapSavedChartPreviewFields', () => {
    it('uses the saved axes and series instead of query-column order', () => {
        expect(build()).toEqual({
            category: 'orders_date',
            split: 'orders_region',
            value: 'orders_revenue',
        });
    });
    it('maps multiple source series and values without adding unused fields', () => {
        expect(
            build(
                {
                    ...chart,
                    pivotConfig: {
                        columns: ['orders_region', 'orders_status'],
                    },
                    chartConfig: {
                        type: ChartType.CARTESIAN,
                        config: {
                            layout: {
                                xField: 'orders_date',
                                yField: ['orders_revenue', 'orders_profit'],
                            },
                            eChartsConfig: {},
                        },
                    },
                },
                fields.map((f) => ({ ...f, multiple: f.type !== 'dimension' })),
            ),
        ).toEqual({
            category: 'orders_date',
            split: ['orders_region', 'orders_status'],
            value: ['orders_revenue', 'orders_profit'],
        });
    });
    it('preserves exact slot bindings for the same custom chart type', () => {
        const saved: SavedChartBindingSource = {
            ...chart,
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'target-viz',
                    fieldMapping: {
                        category: 'orders_status',
                        split: 'orders_date',
                        value: ['orders_profit', 'orders_revenue'],
                    },
                },
            },
        };
        expect(
            build(
                saved,
                fields.map((f) => ({ ...f, multiple: f.type === 'metric' })),
            ),
        ).toEqual({
            category: 'orders_status',
            split: 'orders_date',
            value: ['orders_profit', 'orders_revenue'],
        });
    });
    it('reconciles stale custom bindings while preserving an explicit multiple clear', () => {
        const saved: SavedChartBindingSource = {
            ...chart,
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'target-viz',
                    fieldMapping: {
                        category: 'removed_field',
                        split: 'orders_region',
                        value: [],
                    },
                },
            },
        };
        expect(
            build(
                saved,
                fields.map((f) => ({ ...f, multiple: f.type === 'metric' })),
            ),
        ).toEqual({
            category: 'orders_status',
            split: 'orders_region',
            value: [],
        });
    });
    it('uses roles rather than coincident slot names across custom chart types', () => {
        const saved: SavedChartBindingSource = {
            ...chart,
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'other-viz',
                    fieldMapping: {
                        category: 'orders_revenue',
                        value: 'orders_date',
                        split: 'orders_region',
                    },
                },
            },
        };
        expect(build(saved)).toEqual({
            category: 'orders_date',
            split: 'orders_region',
            value: 'orders_revenue',
        });
    });
    it('uses table row order and excludes hidden source fields', () => {
        const saved: SavedChartBindingSource = {
            ...chart,
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    columns: {
                        orders_tax: { visible: false },
                        orders_status: { visible: false },
                    },
                },
            },
            pivotConfig: { columns: ['orders_region'], rows: ['orders_date'] },
        };
        expect(build(saved)).toEqual({
            category: 'orders_date',
            split: 'orders_region',
            value: 'orders_revenue',
        });
        const withExtra: DataAppVizField[] = [
            ...fields,
            {
                name: 'extra',
                label: 'Extra',
                type: 'dimension',
                required: false,
            },
        ];
        expect(build(saved, withExtra).extra).toBeUndefined();
    });
    it('ignores stale custom-chart pivot columns that are not bound', () => {
        expect(
            build({
                ...chart,
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: 'other-viz',
                        fieldMapping: {
                            category: 'orders_date',
                            value: 'orders_revenue',
                        },
                    },
                },
            }),
        ).toEqual({
            category: 'orders_date',
            split: 'orders_status',
            value: 'orders_revenue',
        });
    });
    it.each<{
        chartConfig: SavedChartBindingSource['chartConfig'];
        dimensions: string[];
        metrics: string[];
    }>([
        {
            chartConfig: {
                type: ChartType.SANKEY,
                config: {
                    sourceFieldId: 'orders_date',
                    targetFieldId: 'orders_region',
                    metricFieldId: 'orders_revenue',
                },
            },
            dimensions: ['orders_date', 'orders_region'],
            metrics: ['orders_revenue'],
        },
        {
            chartConfig: {
                type: ChartType.MAP,
                config: {
                    locationFieldId: 'orders_region',
                    valueFieldId: 'orders_revenue',
                    sizeFieldId: 'orders_profit',
                },
            },
            dimensions: ['orders_region'],
            metrics: ['orders_revenue', 'orders_profit'],
        },
        {
            chartConfig: {
                type: ChartType.GAUGE,
                config: {
                    selectedField: 'orders_revenue',
                    maxFieldId: 'orders_profit',
                },
            },
            dimensions: [],
            metrics: ['orders_revenue', 'orders_profit'],
        },
        {
            chartConfig: {
                type: ChartType.FUNNEL,
                config: { fieldId: 'orders_revenue' },
            },
            dimensions: [],
            metrics: ['orders_revenue'],
        },
    ])(
        'uses explicit $chartConfig.type fields',
        ({ chartConfig, dimensions, metrics }) => {
            const targetFields: DataAppVizField[] = [
                ...(dimensions.length
                    ? [{ ...fields[0], multiple: true }]
                    : []),
                { ...fields[2], multiple: true },
            ];
            expect(
                build(
                    { ...chart, chartConfig, pivotConfig: undefined },
                    targetFields,
                ),
            ).toEqual({
                ...(dimensions.length ? { category: dimensions } : {}),
                value: metrics,
            });
        },
    );
    it('fills unspecified or stale source roles without stealing bound columns', () => {
        expect(
            build({
                ...chart,
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: 'removed_field',
                            yField: ['orders_revenue'],
                        },
                        eChartsConfig: {},
                    },
                },
            }),
        ).toEqual({
            category: 'orders_status',
            split: 'orders_region',
            value: 'orders_revenue',
        });
        expect(build(null)).toEqual({
            category: 'orders_status',
            split: 'orders_region',
            value: 'orders_tax',
        });
    });
});
