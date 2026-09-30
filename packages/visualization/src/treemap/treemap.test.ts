import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type ItemsMap,
    type Metric,
    type ResultRow,
    type TreemapChart,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { LIGHT_VISUALIZATION_THEME } from '../theme';
import {
    buildTreemapData,
    getValidTreemapGroupFieldIds,
    reorderTreemapGroupFieldIds,
    repairTreemapSizeMetricId,
    resolveTreemapChartConfig,
    type TreemapGroupedSubtotals,
} from './config';
import { buildTreemapEchartsOption } from './echartsOption';

const dimension = (name: string): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const metric = (name: string): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const itemsMap: ItemsMap = {
    orders_region: dimension('region'),
    orders_country: dimension('country'),
    orders_revenue: metric('revenue'),
    orders_margin: metric('margin'),
};

const dimensions = {
    orders_region: itemsMap.orders_region as Dimension,
    orders_country: itemsMap.orders_country as Dimension,
};
const numericMetrics = {
    orders_revenue: itemsMap.orders_revenue as Metric,
    orders_margin: itemsMap.orders_margin as Metric,
};

const row = (
    region: string,
    country: string,
    revenue: number,
    margin: number,
): ResultRow => ({
    orders_region: { value: { raw: region, formatted: region } },
    orders_country: { value: { raw: country, formatted: country } },
    orders_revenue: { value: { raw: revenue, formatted: String(revenue) } },
    orders_margin: { value: { raw: margin, formatted: String(margin) } },
});

const rows = [
    row('EU', 'PT', 10, 1),
    row('EU', 'ES', 20, 2),
    row('US', 'CA', 30, 3),
];

// The API types subtotal rows as numbers only; dimension values are strings at runtime.
const groupedSubtotals = {
    orders_region: [
        { orders_region: 'EU', orders_revenue: 30, orders_margin: 3 },
        { orders_region: 'US', orders_revenue: 30, orders_margin: 3 },
    ],
} as unknown as TreemapGroupedSubtotals;

describe('getValidTreemapGroupFieldIds', () => {
    test('keeps the saved order when it covers every dimension', () => {
        expect(
            getValidTreemapGroupFieldIds(
                ['orders_country', 'orders_region'],
                ['orders_region', 'orders_country'],
            ),
        ).toEqual(['orders_country', 'orders_region']);
    });

    test('falls back to the query dimensions otherwise', () => {
        expect(
            getValidTreemapGroupFieldIds(
                ['orders_region'],
                ['orders_region', 'orders_country'],
            ),
        ).toEqual(['orders_region', 'orders_country']);
        expect(
            getValidTreemapGroupFieldIds(undefined, ['orders_region']),
        ).toEqual(['orders_region']);
    });
});

describe('repairTreemapSizeMetricId', () => {
    const allNumericMetricIds = ['orders_revenue', 'orders_margin'];

    test('changes nothing while loading or when the metric is valid', () => {
        expect(
            repairTreemapSizeMetricId({
                sizeMetricId: null,
                allNumericMetricIds,
                isLoading: true,
                tableCalculationsMetadata: undefined,
            }),
        ).toBeUndefined();
        expect(
            repairTreemapSizeMetricId({
                sizeMetricId: 'orders_margin',
                allNumericMetricIds,
                isLoading: false,
                tableCalculationsMetadata: undefined,
            }),
        ).toBeUndefined();
    });

    test('follows a renamed table calculation', () => {
        expect(
            repairTreemapSizeMetricId({
                sizeMetricId: 'old_calc',
                allNumericMetricIds: [...allNumericMetricIds, 'new_calc'],
                isLoading: false,
                tableCalculationsMetadata: [
                    { name: 'new_calc', oldName: 'old_calc' },
                ],
            }),
        ).toBe('new_calc');
    });

    test('picks the first numeric metric otherwise', () => {
        expect(
            repairTreemapSizeMetricId({
                sizeMetricId: null,
                allNumericMetricIds,
                isLoading: false,
                tableCalculationsMetadata: undefined,
            }),
        ).toBe('orders_revenue');
    });
});

describe('reorderTreemapGroupFieldIds', () => {
    test('moves an item without mutating the input', () => {
        const prev = ['a', 'b', 'c'];
        expect(reorderTreemapGroupFieldIds(prev, { from: 2, to: 0 })).toEqual([
            'c',
            'a',
            'b',
        ]);
        expect(prev).toEqual(['a', 'b', 'c']);
    });
});

describe('buildTreemapData', () => {
    test('nests rows by group field order and fills parents from subtotals', () => {
        const data = buildTreemapData({
            resultsData: { rows },
            sizeMetricId: 'orders_revenue',
            selectedSizeMetric: numericMetrics.orders_revenue,
            colorMetricId: 'orders_margin',
            groupFieldIds: ['orders_region', 'orders_country'],
            groupedSubtotals,
        });

        expect(data).toEqual([
            {
                name: 'EU',
                value: [30, 3],
                children: [
                    { name: 'PT', value: [10, 1], children: undefined },
                    { name: 'ES', value: [20, 2], children: undefined },
                ],
            },
            {
                name: 'US',
                value: [30, 3],
                children: [{ name: 'CA', value: [30, 3], children: undefined }],
            },
        ]);
    });

    test('sizes parents by their children without subtotals', () => {
        const data = buildTreemapData({
            resultsData: { rows },
            sizeMetricId: 'orders_revenue',
            selectedSizeMetric: numericMetrics.orders_revenue,
            colorMetricId: null,
            groupFieldIds: ['orders_region', 'orders_country'],
            groupedSubtotals: undefined,
        });

        // EU = PT 10 + ES 20; US = CA 30. Without this the parents have no
        // area and the treemap draws nothing.
        expect(data.map((node) => node.value)).toEqual([
            [30, 0],
            [30, 0],
        ]);
        expect(data[0].children?.[0].value).toEqual([10, 0]);
    });

    test('is empty without a size metric, rows or group fields', () => {
        const base = {
            resultsData: { rows },
            sizeMetricId: 'orders_revenue',
            selectedSizeMetric: numericMetrics.orders_revenue,
            colorMetricId: null,
            groupFieldIds: ['orders_region'],
            groupedSubtotals: undefined,
        };
        expect(buildTreemapData({ ...base, resultsData: undefined })).toEqual(
            [],
        );
        expect(
            buildTreemapData({ ...base, resultsData: { rows: [] } }),
        ).toEqual([]);
        expect(buildTreemapData({ ...base, groupFieldIds: [] })).toEqual([]);
        expect(
            buildTreemapData({
                ...base,
                sizeMetricId: 'orders_missing',
                selectedSizeMetric: metric('missing'),
            }),
        ).toEqual([]);
    });
});

describe('resolveTreemapChartConfig', () => {
    test('fills defaults and picks the first numeric metric for a new chart', () => {
        const resolved = resolveTreemapChartConfig({
            chartConfig: undefined,
            resultsData: { rows },
            itemsMap,
            dimensions,
            numericMetrics,
            groupedSubtotals,
        });

        expect(resolved.validConfig).toEqual<TreemapChart>({
            visibleMin: 100,
            leafDepth: 2,
            groupFieldIds: ['orders_region', 'orders_country'],
            sizeMetricId: 'orders_revenue',
            useDynamicColors: false,
            colorMetricId: undefined,
            startColor: '#91cc75',
            endColor: '#ee6666',
            startColorThreshold: undefined,
            endColorThreshold: undefined,
        });
        expect(resolved.sizeMetricId).toBe('orders_revenue');
        expect(resolved.selectedSizeMetric).toBe(numericMetrics.orders_revenue);
        expect(resolved.selectedColorMetric).toBeUndefined();
        expect(resolved.data.map((node) => node.name)).toEqual(['EU', 'US']);
    });

    test('keeps a valid saved config', () => {
        const chartConfig: TreemapChart = {
            visibleMin: 10,
            leafDepth: 1,
            groupFieldIds: ['orders_country', 'orders_region'],
            sizeMetricId: 'orders_margin',
            colorMetricId: 'orders_revenue',
            useDynamicColors: true,
            startColor: '#000000',
            endColor: '#ffffff',
            startColorThreshold: 0,
            endColorThreshold: 100,
        };
        const resolved = resolveTreemapChartConfig({
            chartConfig,
            resultsData: { rows },
            itemsMap,
            dimensions,
            numericMetrics,
        });

        expect(resolved.validConfig).toEqual(chartConfig);
        expect(resolved.selectedColorMetric).toBe(
            numericMetrics.orders_revenue,
        );
        expect(resolved.data.map((node) => node.name)).toEqual([
            'PT',
            'ES',
            'CA',
        ]);
    });

    test('keeps a missing size metric while the results are loading', () => {
        const resolved = resolveTreemapChartConfig({
            chartConfig: undefined,
            resultsData: undefined,
            itemsMap,
            dimensions,
            numericMetrics,
        });

        expect(resolved.validConfig.sizeMetricId).toBeUndefined();
        expect(resolved.data).toEqual([]);
    });
});

describe('buildTreemapEchartsOption', () => {
    const treemapConfig = resolveTreemapChartConfig({
        chartConfig: undefined,
        resultsData: { rows },
        itemsMap,
        dimensions,
        numericMetrics,
        groupedSubtotals,
    });
    const colorPalette = ['#111111', '#222222'];

    test('builds the series and option from the resolved config', () => {
        const result = buildTreemapEchartsOption({
            treemapConfig,
            itemsMap,
            colorPalette,
            theme: LIGHT_VISUALIZATION_THEME,
            animation: true,
        });

        expect(result).toBeDefined();
        const { eChartsOption, treemapSeriesOption } = result!;
        expect(treemapSeriesOption).toMatchObject({
            type: 'treemap',
            visibleMin: 100,
            leafDepth: 2,
            color: colorPalette,
            colorMappingBy: 'index',
            visualMin: undefined,
            visualMax: undefined,
        });
        expect(treemapSeriesOption.data).toBe(treemapConfig.data);
        // One nested level: the first level entry plus one border level
        expect(treemapSeriesOption.levels).toHaveLength(2);
        expect(treemapSeriesOption.levels?.[1]).toEqual({
            itemStyle: {
                borderColor: LIGHT_VISUALIZATION_THEME.neutral[0],
                borderRadius: 4,
            },
        });
        expect(eChartsOption).toMatchObject({
            animation: true,
            textStyle: { fontFamily: 'Inter, sans-serif' },
            tooltip: { trigger: 'item' },
        });
        expect((eChartsOption.series as unknown[])[0]).toMatchObject({
            animation: true,
        });
    });

    test('uses the gradient colors and thresholds when a color metric is set', () => {
        const result = buildTreemapEchartsOption({
            treemapConfig: {
                ...treemapConfig,
                colorMetricId: 'orders_margin',
                validConfig: {
                    visibleMin: 100,
                    leafDepth: 0,
                    startColor: '#000000',
                    endColor: '#ffffff',
                    startColorThreshold: 0,
                    endColorThreshold: 5,
                },
            },
            itemsMap,
            colorPalette,
            theme: LIGHT_VISUALIZATION_THEME,
            animation: false,
        });

        expect(result?.treemapSeriesOption).toMatchObject({
            leafDepth: undefined,
            color: ['#000000', '#ffffff'],
            colorMappingBy: 'value',
            visualMin: 0,
            visualMax: 5,
        });
        expect(result?.eChartsOption.animation).toBe(false);
    });

    test('formats the tooltip with the size and color metrics', () => {
        const result = buildTreemapEchartsOption({
            treemapConfig: { ...treemapConfig, colorMetricId: 'orders_margin' },
            itemsMap,
            colorPalette,
            theme: LIGHT_VISUALIZATION_THEME,
        });
        const formatter = result?.treemapSeriesOption.tooltip?.formatter;
        expect(typeof formatter).toBe('function');
        const html = (formatter as (info: unknown) => string)({
            name: 'EU',
            value: [30, 3],
            color: '#abcdef',
        });
        expect(html).toContain('EU');
        expect(html).toContain('revenue');
        expect(html).toContain('margin');
        expect(html).toContain('#abcdef');
    });

    test('is undefined without items, config or data', () => {
        const base = {
            treemapConfig,
            itemsMap,
            colorPalette,
            theme: LIGHT_VISUALIZATION_THEME,
        };
        expect(
            buildTreemapEchartsOption({ ...base, itemsMap: undefined }),
        ).toBeUndefined();
        expect(
            buildTreemapEchartsOption({ ...base, treemapConfig: undefined }),
        ).toBeUndefined();
        expect(
            buildTreemapEchartsOption({
                ...base,
                treemapConfig: { ...treemapConfig, data: [] },
            }),
        ).toBeUndefined();
    });
});
