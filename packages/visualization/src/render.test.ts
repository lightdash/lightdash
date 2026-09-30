import {
    ChartType,
    DimensionType,
    FieldType,
    FunnelChartDataInput,
    MetricType,
    type ChartConfig,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { type ChartData } from './chartData';
import {
    ordersColumnOrder,
    ordersData,
    ordersItemsMap,
    ordersPivotedData,
    ordersRawRows,
    palette,
} from './fixtures.mock';
import {
    buildChart,
    renderChart,
    resolveChart,
    type RenderedChart,
    type RenderOptions,
} from './render';
import { toResultRows } from './results';
import { DARK_VISUALIZATION_THEME, LIGHT_VISUALIZATION_THEME } from './theme';

const render = (
    chartConfig: ChartConfig,
    {
        data = ordersData,
        pivotColumns,
        ...options
    }: RenderOptions & { data?: ChartData; pivotColumns?: string[] } = {},
): RenderedChart =>
    renderChart(
        {
            chartConfig,
            pivotConfig: pivotColumns ? { columns: pivotColumns } : undefined,
            tableConfig: { columnOrder: ordersColumnOrder },
        },
        data,
        { colors: { palette }, ...options },
    );

const echartsOf = (rendered: RenderedChart) => {
    expect(rendered.kind).toBe('echarts');
    if (rendered.kind !== 'echarts') throw new Error('not an echarts chart');
    return rendered.option;
};

const cartesian: ChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: { xField: 'orders_status', yField: ['orders_revenue'] },
        eChartsConfig: {},
    },
};

describe('renderChart', () => {
    test('cartesian: one bar series over the status axis', () => {
        const option = echartsOf(render(cartesian));
        expect(option.series).toHaveLength(1);
        expect(option.series).toMatchObject([
            { type: 'bar', color: palette[0] },
        ]);
        expect(option.dataset).toMatchObject({ source: expect.any(Array) });
    });

    test('cartesian grouped by a pivot: one series per channel, from the palette', () => {
        const option = echartsOf(
            render(cartesian, {
                data: ordersPivotedData,
                pivotColumns: ['orders_channel'],
            }),
        );
        const series = option.series as {
            color?: string;
            pivotReference?: { pivotValues?: { value: unknown }[] };
        }[];
        expect(
            series.map((s) => s.pivotReference?.pivotValues?.[0]?.value),
        ).toEqual(['web', 'store']);
        expect(series.map((s) => s.color)).toEqual([palette[0], palette[1]]);
        // The series are named by the channel through their dataset encoding,
        // which is what the legend shows.
        expect(JSON.stringify(option.series)).toContain('"web"');
        expect(JSON.stringify(option.series)).toContain('"store"');
    });

    test('pie: one slice per status', () => {
        const option = echartsOf(
            render({
                type: ChartType.PIE,
                config: {
                    groupFieldIds: ['orders_status'],
                    metricId: 'orders_revenue',
                },
            }),
        );
        const [series] = option.series as { data: unknown[] }[];
        expect(series.data).toHaveLength(2);
    });

    test('funnel: one step per status, rows of the same status merged', () => {
        const option = echartsOf(
            render({
                type: ChartType.FUNNEL,
                config: {
                    fieldId: 'orders_revenue',
                    dataInput: FunnelChartDataInput.ROW,
                },
            }),
        );
        const [series] = option.series as { data: unknown[] }[];
        expect(series.data).toHaveLength(2);
    });

    test('treemap: grouped by status, sized by revenue', () => {
        const option = echartsOf(
            render({
                type: ChartType.TREEMAP,
                config: {
                    groupFieldIds: ['orders_status'],
                    sizeMetricId: 'orders_revenue',
                },
            }),
        );
        const [series] = option.series as { data: unknown[] }[];
        expect(series.data).toHaveLength(2);
    });

    test('gauge: sized to the box it renders in', () => {
        const small = echartsOf(
            render(
                {
                    type: ChartType.GAUGE,
                    config: {
                        selectedField: 'orders_revenue',
                        min: 0,
                        max: 5000,
                    },
                },
                { size: { width: 200, height: 150 } },
            ),
        );
        const large = echartsOf(
            render(
                {
                    type: ChartType.GAUGE,
                    config: {
                        selectedField: 'orders_revenue',
                        min: 0,
                        max: 5000,
                    },
                },
                { size: { width: 1000, height: 1000 } },
            ),
        );
        expect(JSON.stringify(small)).not.toEqual(JSON.stringify(large));
    });

    test('sankey: status flows into channel', () => {
        const option = echartsOf(
            render({
                type: ChartType.SANKEY,
                config: {
                    sourceFieldId: 'orders_status',
                    targetFieldId: 'orders_channel',
                    metricFieldId: 'orders_revenue',
                },
            }),
        );
        const [series] = option.series as { links: unknown[] }[];
        expect(series.links).toHaveLength(3);
    });

    test('big number: the first row, formatted by its field', () => {
        const rendered = render({
            type: ChartType.BIG_NUMBER,
            config: { selectedField: 'orders_revenue' },
        });
        expect(rendered).toMatchObject({
            kind: 'bigNumber',
            model: { value: '$1,200.50' },
        });
    });

    test('table: one column per selected field, in order', () => {
        const rendered = render({ type: ChartType.TABLE, config: {} });
        expect(rendered.kind).toBe('table');
        if (rendered.kind !== 'table') return;
        expect(rendered.model.columns.map((column) => column.id)).toEqual(
            ordersColumnOrder,
        );
        expect(rendered.model.rows).toHaveLength(3);
    });

    test('custom: the spec and the raw values', () => {
        const rendered = render({
            type: ChartType.CUSTOM,
            config: { spec: { mark: 'bar' } },
        });
        expect(rendered).toMatchObject({
            kind: 'custom',
            spec: { mark: 'bar' },
        });
        if (rendered.kind !== 'custom') return;
        expect(rendered.data.series).toHaveLength(3);
    });

    test('maps are not drawn here', () => {
        expect(render({ type: ChartType.MAP, config: {} })).toMatchObject({
            kind: 'unsupported',
            chartType: ChartType.MAP,
        });
    });

    test('no rows means nothing to draw, and says so', () => {
        expect(
            render(cartesian, { data: { ...ordersData, rows: [] } }),
        ).toMatchObject({
            kind: 'empty',
            chartType: ChartType.CARTESIAN,
            reason: 'noRows',
        });
    });

    test('a pivoted chart without pivot details says what it needs', () => {
        expect(
            render(cartesian, { pivotColumns: ['orders_channel'] }),
        ).toMatchObject({ kind: 'empty', reason: 'needsPivotDetails' });
    });

    test('a pivoted table without the pivot table says what it needs', () => {
        expect(
            render(
                { type: ChartType.TABLE, config: {} },
                { data: ordersPivotedData, pivotColumns: ['orders_channel'] },
            ),
        ).toMatchObject({ kind: 'empty', reason: 'needsPivotTable' });
    });

    test('the saved legend selection hides series, unless overridden', () => {
        const hidden: ChartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'orders_status', yField: ['orders_revenue'] },
                eChartsConfig: { legend: { selected: { Revenue: false } } },
            },
        };
        const legendOf = (rendered: RenderedChart) =>
            (echartsOf(rendered).legend as { selected?: object }).selected;
        expect(legendOf(render(hidden))).toEqual({ Revenue: false });
        expect(
            legendOf(render(hidden, { legendSelection: { Revenue: true } })),
        ).toEqual({ Revenue: true });
    });

    test('renderChart is resolveChart then buildChart', () => {
        const chart = {
            chartConfig: cartesian,
            tableConfig: { columnOrder: ordersColumnOrder },
        };
        const options = { colors: { palette } };
        const resolved = resolveChart(chart, ordersData, options);
        expect(resolved.chartType).toBe(ChartType.CARTESIAN);
        expect(JSON.stringify(buildChart(resolved, ordersData, options))).toBe(
            JSON.stringify(renderChart(chart, ordersData, options)),
        );
    });

    test('colour assignments come back as plain data, and carry over', () => {
        const pie: ChartConfig = {
            type: ChartType.PIE,
            config: {
                groupFieldIds: ['orders_status'],
                metricId: 'orders_revenue',
            },
        };
        const first = render(pie);
        expect(JSON.parse(JSON.stringify(first.colorAssignments))).toEqual(
            first.colorAssignments,
        );
        const again = render(pie, {
            colors: { palette, assignments: first.colorAssignments },
        });
        expect(again.colorAssignments).toEqual(first.colorAssignments);
    });

    test('fields need only a type, a label and a format', () => {
        const option = echartsOf(
            render(cartesian, {
                data: {
                    rows: ordersData.rows,
                    fields: {
                        orders_status: {
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            label: 'Status',
                        },
                        orders_revenue: {
                            fieldType: FieldType.METRIC,
                            type: MetricType.SUM,
                            label: 'Revenue',
                            format: 'usd',
                        },
                    },
                },
            }),
        );
        expect(option.series).toHaveLength(1);
    });

    test('the dark theme colors the option', () => {
        const light = JSON.stringify(
            echartsOf(render(cartesian, { theme: LIGHT_VISUALIZATION_THEME })),
        );
        const dark = JSON.stringify(
            echartsOf(render(cartesian, { theme: DARK_VISUALIZATION_THEME })),
        );
        expect(dark).toContain(DARK_VISUALIZATION_THEME.background);
        expect(light).not.toContain(DARK_VISUALIZATION_THEME.background);
    });

    test('raw rows from any query source render through toResultRows', () => {
        const option = echartsOf(
            render(cartesian, {
                data: {
                    ...ordersData,
                    rows: toResultRows(ordersRawRows, ordersItemsMap),
                },
            }),
        );
        expect(option.series).toHaveLength(1);
        // The dataset carries raw values; the formatted ones drive labels and tooltips.
        expect(option.dataset).toMatchObject({
            source: [
                expect.objectContaining({
                    orders_status: 'completed',
                    orders_revenue: 1200.5,
                }),
                expect.anything(),
                expect.anything(),
            ],
        });
    });
});
