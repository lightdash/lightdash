/**
 * What a consumer of the published package writes. `smoke-pack.mjs` copies
 * this file into a project outside the monorepo, typechecks it under
 * node16 (ESM and CommonJS) and bundler resolution, then compiles and runs it
 * with plain Node as ESM and as CommonJS.
 *
 * When the public API changes, update the `renderChart` call below; it is the
 * only place the smoke test spells out the signature.
 */
/* oxlint-disable no-console -- a command-line check reports on stdout */
import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    type ItemsMap,
} from '@lightdash/common';
import { renderChart, type RenderedChart } from '@lightdash/visualization';
import { getGaugeSizes } from '@lightdash/visualization/editor';

const itemsMap: ItemsMap = {
    orders_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'orders',
        tableLabel: 'Orders',
        sql: 'orders.status',
        hidden: false,
    },
    orders_revenue: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'revenue',
        label: 'Revenue',
        table: 'orders',
        tableLabel: 'Orders',
        sql: 'orders.amount',
        hidden: false,
    },
};

const rendered: RenderedChart = renderChart({
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'orders_status', yField: ['orders_revenue'] },
            eChartsConfig: {},
        },
    },
    results: {
        rows: [
            {
                orders_status: {
                    value: { raw: 'completed', formatted: 'completed' },
                },
                orders_revenue: { value: { raw: 120, formatted: '120' } },
            },
            {
                orders_status: {
                    value: { raw: 'shipped', formatted: 'shipped' },
                },
                orders_revenue: { value: { raw: 80, formatted: '80' } },
            },
        ],
        fields: itemsMap,
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_revenue'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
    },
    itemsMap,
    colorPalette: ['#111111', '#222222', '#333333'],
});

/** Exhaustive over the render kinds: a new kind fails to compile here. */
const describeRendered = (chart: RenderedChart): string => {
    switch (chart.kind) {
        case 'echarts': {
            const { series } = chart.option;
            const first = Array.isArray(series) ? series[0] : series;
            return `echarts ${first?.type ?? 'none'}`;
        }
        case 'table':
            return `table ${chart.model.columns.length} columns`;
        case 'bigNumber':
            return 'bigNumber';
        case 'custom':
            return 'custom';
        case 'unsupported':
        case 'empty':
            return chart.kind;
        // If the package's types resolved to `any`, this line would compile
        // and the directive would fail the typecheck.
        // @ts-expect-error 'notAKind' is not a render kind
        case 'notAKind':
            return 'impossible';
        default: {
            const unreachable: never = chart;
            return unreachable;
        }
    }
};

const description = describeRendered(rendered);
if (description !== 'echarts bar') {
    throw new Error(`Expected a bar chart, got "${description}"`);
}

const sizes = getGaugeSizes({ width: 400, height: 300 });
if (!(sizes.radius > 0)) {
    throw new Error('getGaugeSizes from /editor returned no radius');
}

console.log(`ok: ${description}, gauge radius ${sizes.radius}`);
