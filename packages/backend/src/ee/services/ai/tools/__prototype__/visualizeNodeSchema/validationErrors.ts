/* eslint-disable no-console */
// PROTOTYPE (ZAP-1278): what the model sees when a config does not fit the columns.
import { DimensionType, type ResultColumns } from '@lightdash/common';
import { resolveA, resolveB, validateResolved } from './visualizeNodeSchemas';

const columns: ResultColumns = {
    orders_order_date_month: { reference: 'orders_order_date_month', type: DimensionType.DATE },
    orders_status: { reference: 'orders_status', type: DimensionType.STRING },
    orders_total_order_amount: { reference: 'orders_total_order_amount', type: DimensionType.NUMBER },
};
const heatmap = [
    { name: 'x', type: 'dimension' as const, label: 'X', required: true },
    { name: 'y', type: 'dimension' as const, label: 'Y', required: true },
    { name: 'value', type: 'metric' as const, label: 'V', required: true },
];
const lookup = (slug: string) => (slug === 'heatmap' ? heatmap : null);
const base = { nodeId: 'n', stack: null, secondaryY: null, xAxisLabel: null, yAxisLabel: null, customChartTypeSlug: null, fieldMapping: null };

const cases: [string, string[]][] = [
    ['A: y is a string column', validateResolved(resolveA({ ...base, chartType: 'bar', x: 'orders_order_date_month', y: ['orders_status'], groupBy: null }), columns, lookup)],
    ['A: groupBy repeats x', validateResolved(resolveA({ ...base, chartType: 'bar', x: 'orders_status', y: ['orders_total_order_amount'], groupBy: ['orders_status'] }), columns, lookup)],
    ['A: unknown column', validateResolved(resolveA({ ...base, chartType: 'line', x: 'month', y: ['revenue'], groupBy: null }), columns, lookup)],
    ['A: custom slot type mismatch', validateResolved(resolveA({ ...base, chartType: 'custom', x: null, y: null, groupBy: null, customChartTypeSlug: 'heatmap', fieldMapping: { x: 'orders_total_order_amount', y: 'orders_status', value: 'orders_status' } }), columns, lookup)],
    ['A: custom missing slot + unknown slot', validateResolved(resolveA({ ...base, chartType: 'custom', x: null, y: null, groupBy: null, customChartTypeSlug: 'heatmap', fieldMapping: { x: 'orders_order_date_month', colour: 'orders_status' } }), columns, lookup)],
    ['B: series disagrees with layout', validateResolved(resolveB({ nodeId: 'n', pivotColumns: null, chartConfig: { type: 'cartesian', config: { layout: { xField: 'orders_order_date_month', yField: ['orders_total_order_amount'], flipAxes: null }, eChartsConfig: { series: [{ type: 'bar', encode: { xRef: { field: 'orders_status' }, yRef: { field: 'orders_status' } }, stack: null, yAxisIndex: null }], xAxis: null, yAxis: null } } } }), columns, lookup)],
];
cases.forEach(([name, errors]) => console.log(`${name}\n  -> ${errors.join('\n  -> ')}\n`));
