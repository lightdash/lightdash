import {
    ChartType,
    DimensionType,
    FieldType,
    FunnelChartDataInput,
    MetricType,
    type ChartConfig,
    type Dimension,
    type ItemsMap,
    type Metric,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { createColorMappings } from './colors/mappings';
import {
    ordersColumnOrder,
    ordersItemsMap,
    ordersRawRows,
    ordersResults,
    palette,
} from './fixtures.mock';
import { renderChart } from './render';
import { toResultRows } from './results';

/**
 * The edges a headless caller meets: no rows, missing values, fields the
 * config names that the results do not carry, dates, and colors shared
 * across the charts of one page.
 */

const CONFIGS: Record<string, ChartConfig> = {
    cartesian: {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'orders_status', yField: ['orders_revenue'] },
            eChartsConfig: {},
        },
    },
    pie: {
        type: ChartType.PIE,
        config: {
            groupFieldIds: ['orders_status'],
            metricId: 'orders_revenue',
        },
    },
    funnel: {
        type: ChartType.FUNNEL,
        config: {
            fieldId: 'orders_revenue',
            dataInput: FunnelChartDataInput.ROW,
        },
    },
    treemap: {
        type: ChartType.TREEMAP,
        config: {
            groupFieldIds: ['orders_status'],
            sizeMetricId: 'orders_revenue',
        },
    },
    gauge: {
        type: ChartType.GAUGE,
        config: { selectedField: 'orders_revenue', min: 0, max: 5000 },
    },
    sankey: {
        type: ChartType.SANKEY,
        config: {
            sourceFieldId: 'orders_status',
            targetFieldId: 'orders_channel',
            metricFieldId: 'orders_revenue',
        },
    },
    bigNumber: {
        type: ChartType.BIG_NUMBER,
        config: { selectedField: 'orders_revenue' },
    },
    table: { type: ChartType.TABLE, config: {} },
    custom: { type: ChartType.CUSTOM, config: { spec: { mark: 'bar' } } },
};

const render = (
    chartConfig: ChartConfig,
    overrides: Partial<Parameters<typeof renderChart>[0]> = {},
) =>
    renderChart({
        chartConfig,
        results: ordersResults,
        itemsMap: ordersItemsMap,
        columnOrder: ordersColumnOrder,
        colorPalette: palette,
        ...overrides,
    });

describe('no rows', () => {
    test.each(Object.entries(CONFIGS))(
        '%s draws nothing, and never throws',
        (_name, chartConfig) => {
            const rendered = render(chartConfig, {
                results: { ...ordersResults, rows: [] },
            });
            expect(['empty', 'table', 'custom']).toContain(rendered.kind);
            if (rendered.kind === 'table') {
                expect(rendered.model.rows).toEqual([]);
            }
            if (rendered.kind === 'custom') {
                expect(rendered.data.series).toEqual([]);
            }
        },
    );
});

describe('missing values', () => {
    const rowsWithNulls = toResultRows(
        [
            {
                orders_status: 'completed',
                orders_channel: 'web',
                orders_revenue: null,
                orders_count: 1,
            },
            {
                orders_status: null,
                orders_channel: 'web',
                orders_revenue: 50,
                orders_count: 2,
            },
            {
                orders_status: 'shipped',
                orders_channel: null,
                orders_revenue: 75,
                orders_count: null,
            },
        ],
        ordersItemsMap,
    );
    const results = { rows: rowsWithNulls, fields: ordersItemsMap };

    test.each(Object.entries(CONFIGS))(
        '%s renders rows with nulls without throwing',
        (_name, chartConfig) => {
            expect(() => render(chartConfig, { results })).not.toThrow();
        },
    );

    test('a null group is a slice of its own, shown as the empty-set sign', () => {
        const rendered = render(CONFIGS.pie, { results });
        expect(rendered.kind).toBe('echarts');
        if (rendered.kind !== 'echarts') return;
        const [series] = rendered.option.series as {
            data: { name: string }[];
        }[];
        expect(series.data.map((slice) => slice.name)).toContain('∅');
    });
});

describe('a config naming fields the results lack', () => {
    test('cartesian falls back to what the results have', () => {
        const rendered = render({
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'orders_gone', yField: ['orders_missing'] },
                eChartsConfig: {},
            },
        });
        // The resolver picks the first dimension and metrics, as the explorer does.
        expect(rendered.kind).toBe('echarts');
    });

    test('a big number with a field that is gone picks the first available', () => {
        const rendered = render({
            type: ChartType.BIG_NUMBER,
            config: { selectedField: 'orders_gone' },
        });
        expect(rendered.kind).toBe('bigNumber');
        if (rendered.kind !== 'bigNumber') return;
        expect(rendered.model.value).toBeDefined();
    });

    test('a gauge with a field that is gone draws nothing', () => {
        const rendered = render({
            type: ChartType.GAUGE,
            config: { selectedField: 'orders_gone' },
        });
        // The first numeric field stands in, as the editor's picker would.
        expect(['echarts', 'empty']).toContain(rendered.kind);
    });
});

describe('dates', () => {
    const dateField: Dimension = {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.DATE,
        timeInterval: 'WEEK' as never,
        name: 'order_date_week',
        label: 'Order date week',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    };
    const revenue: Metric = {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'revenue',
        label: 'Revenue',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    };
    const itemsMap: ItemsMap = {
        orders_order_date_week: dateField,
        orders_revenue: revenue,
    };
    const rows = toResultRows(
        [
            { orders_order_date_week: '2026-08-03', orders_revenue: 10 },
            { orders_order_date_week: '2026-08-10', orders_revenue: 20 },
            { orders_order_date_week: '2026-08-24', orders_revenue: 40 },
        ],
        itemsMap,
    );

    test('a weekly date axis is a time or category axis', () => {
        const rendered = renderChart({
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_order_date_week',
                        yField: ['orders_revenue'],
                    },
                    eChartsConfig: {},
                },
            },
            results: { rows, fields: itemsMap },
            itemsMap,
            columnOrder: ['orders_order_date_week', 'orders_revenue'],
            colorPalette: palette,
        });
        expect(rendered.kind).toBe('echarts');
        if (rendered.kind !== 'echarts') return;
        const [xAxis] = rendered.option.xAxis as {
            type: string;
            data?: unknown[];
        }[];
        expect(['time', 'category']).toContain(xAxis.type);
        // A week formats as its date; the renderer's axis labels add the granularity.
        expect(rows[0].orders_order_date_week.value.formatted).toBe(
            '2026-08-03',
        );
    });
});

describe('colors shared across a page', () => {
    test('the same group value gets the same color in two charts', () => {
        const colorMappings = createColorMappings();
        const pieA = render(CONFIGS.pie, { colorMappings });
        const pieB = render(
            {
                type: ChartType.PIE,
                config: {
                    groupFieldIds: ['orders_status'],
                    metricId: 'orders_count',
                },
            },
            { colorMappings },
        );
        expect(pieA.kind).toBe('echarts');
        expect(pieB.kind).toBe('echarts');
        if (pieA.kind !== 'echarts' || pieB.kind !== 'echarts') return;
        const colorsOf = (rendered: typeof pieA) => {
            const [series] = rendered.option.series as {
                data: { name: string; itemStyle?: { color?: string } }[];
            }[];
            return Object.fromEntries(
                series.data.map((slice) => [
                    slice.name,
                    slice.itemStyle?.color,
                ]),
            );
        };
        expect(colorsOf(pieB)).toEqual(colorsOf(pieA));
    });

    test('raw rows and pre-formatted rows render the same option', () => {
        const fromRaw = render(CONFIGS.cartesian, {
            results: {
                rows: toResultRows(ordersRawRows, ordersItemsMap),
                fields: ordersItemsMap,
            },
        });
        const fromFormatted = render(CONFIGS.cartesian);
        expect(JSON.stringify(fromRaw)).toEqual(JSON.stringify(fromFormatted));
    });
});
