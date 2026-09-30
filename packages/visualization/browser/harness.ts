/**
 * The browser harness: renders every fixture chart through `renderChart`
 * into real ECharts instances, the way a consumer would, so the Playwright
 * specs can assert on what a browser actually draws. `?theme=dark` renders
 * the dark theme.
 */
import {
    CartesianSeriesType,
    ChartType,
    FunnelChartDataInput,
    StackType,
    type ChartConfig,
} from '@lightdash/common';
import * as echarts from 'echarts';
import {
    ordersColumnOrder,
    ordersItemsMap,
    ordersPivotedResults,
    ordersRawRows,
    palette,
} from '../src/fixtures.mock';
import {
    DARK_VISUALIZATION_THEME,
    LIGHT_VISUALIZATION_THEME,
    renderChart,
    toResultRows,
    type RenderedChart,
} from '../src/index';

export type HarnessCase = {
    id: string;
    chartConfig: ChartConfig;
    /** Grouped by a pivot dimension, from the pivoted results. */
    pivotColumns?: string[];
};

export const CASES: HarnessCase[] = [
    {
        id: 'bar',
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'orders_status', yField: ['orders_revenue'] },
                eChartsConfig: {},
            },
        },
    },
    {
        id: 'bar-grouped',
        pivotColumns: ['orders_channel'],
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'orders_status', yField: ['orders_revenue'] },
                eChartsConfig: {},
            },
        },
    },
    {
        id: 'line-two-metrics',
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'orders_channel',
                    yField: ['orders_revenue', 'orders_count'],
                },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.LINE,
                            encode: {
                                xRef: { field: 'orders_channel' },
                                yRef: { field: 'orders_revenue' },
                            },
                            yAxisIndex: 0,
                        },
                        {
                            type: CartesianSeriesType.LINE,
                            encode: {
                                xRef: { field: 'orders_channel' },
                                yRef: { field: 'orders_count' },
                            },
                            yAxisIndex: 1,
                        },
                    ],
                },
            },
        },
    },
    {
        id: 'horizontal-stacked',
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'orders_status',
                    yField: ['orders_revenue', 'orders_count'],
                    flipAxes: true,
                    stack: StackType.NORMAL,
                },
                eChartsConfig: {},
            },
        },
    },
    {
        id: 'pie',
        chartConfig: {
            type: ChartType.PIE,
            config: {
                groupFieldIds: ['orders_status'],
                metricId: 'orders_revenue',
                valueLabel: 'outside',
                showPercentage: true,
            },
        },
    },
    {
        id: 'funnel',
        chartConfig: {
            type: ChartType.FUNNEL,
            config: {
                fieldId: 'orders_revenue',
                dataInput: FunnelChartDataInput.ROW,
            },
        },
    },
    {
        id: 'treemap',
        chartConfig: {
            type: ChartType.TREEMAP,
            config: {
                groupFieldIds: ['orders_status', 'orders_channel'],
                sizeMetricId: 'orders_revenue',
            },
        },
    },
    {
        id: 'gauge',
        chartConfig: {
            type: ChartType.GAUGE,
            config: { selectedField: 'orders_revenue', min: 0, max: 5000 },
        },
    },
    {
        id: 'sankey',
        chartConfig: {
            type: ChartType.SANKEY,
            config: {
                sourceFieldId: 'orders_status',
                targetFieldId: 'orders_channel',
                metricFieldId: 'orders_revenue',
            },
        },
    },
    {
        id: 'big-number',
        chartConfig: {
            type: ChartType.BIG_NUMBER,
            config: { selectedField: 'orders_revenue', showComparison: true },
        },
    },
    {
        id: 'table',
        chartConfig: { type: ChartType.TABLE, config: {} },
    },
];

const themeName =
    new URLSearchParams(window.location.search).get('theme') === 'dark'
        ? 'dark'
        : 'light';
const theme =
    themeName === 'dark' ? DARK_VISUALIZATION_THEME : LIGHT_VISUALIZATION_THEME;
document.body.dataset.theme = themeName;

const results = {
    rows: toResultRows(ordersRawRows, ordersItemsMap),
    fields: ordersItemsMap,
};

const main = document.getElementById('cases')!;
const rendered: Record<string, RenderedChart['kind']> = {};
const charts: Record<string, echarts.ECharts> = {};

for (const testCase of CASES) {
    const section = document.createElement('section');
    section.dataset.case = testCase.id;
    const heading = document.createElement('h2');
    heading.textContent = testCase.id;
    section.append(heading);
    // Attached before drawing: ECharts sizes its SVG to the host's layout.
    main.append(section);

    const output = renderChart({
        chartConfig: testCase.chartConfig,
        results: testCase.pivotColumns ? ordersPivotedResults : results,
        pivotConfig: testCase.pivotColumns
            ? { columns: testCase.pivotColumns }
            : undefined,
        itemsMap: ordersItemsMap,
        columnOrder: ordersColumnOrder,
        colorPalette: palette,
        theme,
        size: { width: 640, height: 360 },
        animation: false,
    });
    rendered[testCase.id] = output.kind;
    section.dataset.kind = output.kind;

    switch (output.kind) {
        case 'echarts': {
            const host = document.createElement('div');
            host.className = 'chart';
            section.append(host);
            const chart = echarts.init(host, undefined, { renderer: 'svg' });
            chart.setOption(output.option);
            charts[testCase.id] = chart;
            break;
        }
        case 'table': {
            const table = document.createElement('table');
            const head = table.createTHead().insertRow();
            for (const column of output.model.columns) {
                const cell = document.createElement('th');
                cell.textContent =
                    column.header.kind === 'field'
                        ? column.header.label
                        : column.header.kind === 'override'
                          ? column.header.label
                          : column.id;
                head.append(cell);
            }
            const body = table.createTBody();
            for (const row of output.model.rows) {
                const tr = body.insertRow();
                for (const column of output.model.columns) {
                    tr.insertCell().textContent =
                        row[column.id]?.value.formatted ?? '';
                }
            }
            section.append(table);
            break;
        }
        case 'bigNumber': {
            const value = document.createElement('div');
            value.className = 'big-number';
            value.textContent = output.model.value ?? '';
            const label = document.createElement('div');
            label.className = 'big-number-label';
            label.textContent = output.model.label ?? '';
            const comparison = document.createElement('div');
            comparison.className = 'big-number-comparison';
            comparison.textContent =
                output.model.comparison?.formattedValue ?? '';
            section.append(value, label, comparison);
            break;
        }
        default: {
            const note = document.createElement('p');
            note.textContent = output.kind;
            section.append(note);
        }
    }
}

declare global {
    interface Window {
        harness: {
            rendered: Record<string, RenderedChart['kind']>;
            /** Shows the tooltip of a series point, as hovering it would. */
            showTip: (
                id: string,
                seriesIndex: number,
                dataIndex: number,
            ) => void;
            /** Toggles a legend entry, as clicking it would. */
            toggleLegend: (id: string, name: string) => void;
        };
    }
}
window.harness = {
    rendered,
    showTip: (id, seriesIndex, dataIndex) =>
        charts[id]?.dispatchAction({ type: 'showTip', seriesIndex, dataIndex }),
    toggleLegend: (id, name) =>
        charts[id]?.dispatchAction({ type: 'legendToggleSelect', name }),
};
