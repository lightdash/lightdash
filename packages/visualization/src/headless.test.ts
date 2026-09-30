import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    type CartesianChart,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
    type ResultRow,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { resolveCartesianChartConfig } from './cartesian/config';
import { buildCartesianEchartsOption } from './cartesian/echartsOption';
import { createColorMappings } from './colors/mappings';
import { createSeriesColorResolver } from './colors/resolver';
import { LIGHT_VISUALIZATION_THEME } from './theme';

/**
 * The package's reason to exist: a saved chart plus query results renders to
 * an ECharts option with no React, Mantine or DOM around.
 */

const statusDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
};

const revenueMetric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    hidden: false,
};

const itemsMap: ItemsMap = {
    orders_status: statusDimension,
    orders_revenue: revenueMetric,
};

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_revenue'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const rows: ResultRow[] = [
    {
        orders_status: { value: { raw: 'completed', formatted: 'completed' } },
        orders_revenue: { value: { raw: 120, formatted: '120' } },
    },
    {
        orders_status: { value: { raw: 'shipped', formatted: 'shipped' } },
        orders_revenue: { value: { raw: 80, formatted: '80' } },
    },
];

/** A chart saved with a layout only; the series are derived from the results. */
const savedChartConfig: CartesianChart = {
    layout: { xField: 'orders_status', yField: ['orders_revenue'] },
    eChartsConfig: {},
};

const colorPalette = ['#111111', '#222222', '#333333'];

describe('headless cartesian render', () => {
    test('a saved chart and its results become an ECharts option', () => {
        const resultsData = { rows, fields: itemsMap, metricQuery };

        const validCartesianConfig = resolveCartesianChartConfig({
            chartConfig: savedChartConfig,
            resultsData,
            itemsMap,
            pivotKeys: undefined,
            columnOrder: [],
        });

        expect(validCartesianConfig.layout).toMatchObject({
            xField: 'orders_status',
            yField: ['orders_revenue'],
        });
        expect(validCartesianConfig.eChartsConfig.series).toHaveLength(1);
        expect(validCartesianConfig.eChartsConfig.series?.[0]).toMatchObject({
            type: 'bar',
            yAxisIndex: 0,
            encode: {
                xRef: { field: 'orders_status' },
                yRef: { field: 'orders_revenue' },
            },
        });

        const { getSeriesColor } = createSeriesColorResolver({
            colorPalette,
            colorMappings: createColorMappings(),
            nullColor: LIGHT_VISUALIZATION_THEME.neutral[6],
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: validCartesianConfig,
            },
            itemsMap,
        });

        const option = buildCartesianEchartsOption({
            validCartesianConfig,
            pivotDimensions: undefined,
            resultsData,
            itemsMap,
            getSeriesColor,
            colorPalette,
            theme: LIGHT_VISUALIZATION_THEME,
        });

        expect(option).toBeDefined();
        expect(option?.dataset.source).toHaveLength(2);
        expect(option?.series).toHaveLength(1);
        expect(option?.series[0]).toMatchObject({
            type: 'bar',
            color: '#111111',
        });
        expect(option?.xAxis[0]).toMatchObject({ type: 'category' });
        expect(option?.yAxis[0]).toMatchObject({ type: 'value' });
        expect(option?.textStyle.fontFamily).toBe('Inter, sans-serif');
        expect(option?.animation).toBe(true);
    });

    test('nothing to draw without rows', () => {
        const validCartesianConfig = resolveCartesianChartConfig({
            chartConfig: savedChartConfig,
            resultsData: { rows: [], fields: itemsMap, metricQuery },
            itemsMap,
            pivotKeys: undefined,
            columnOrder: [],
        });

        const option = buildCartesianEchartsOption({
            validCartesianConfig,
            pivotDimensions: undefined,
            resultsData: { rows: [], fields: itemsMap, metricQuery },
            itemsMap,
            getSeriesColor: () => colorPalette[0],
            colorPalette,
            theme: LIGHT_VISUALIZATION_THEME,
        });

        expect(option).toBeUndefined();
    });
});
