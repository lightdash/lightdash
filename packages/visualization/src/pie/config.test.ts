import { describe, expect, test } from 'vitest';
import {
    buildValidPieConfig,
    getPieChartData,
    getSortedPieGroupLabels,
    isPieValueOptionOverridden,
    repairPieGroupFieldIds,
    repairPieMetricId,
    resolvePieChartConfig,
} from './config';
import { PIE_ITEMS_MAP, PIE_REVENUE_METRIC, PIE_ROWS } from './fixtures.mock';

describe('getPieChartData', () => {
    test('sums the metric per group and sorts the slices largest first', () => {
        const data = getPieChartData({
            resultsData: { rows: PIE_ROWS },
            groupFieldIds: ['orders_status'],
            metricId: 'orders_revenue',
            selectedMetric: PIE_REVENUE_METRIC,
        });

        expect(data.map(({ name, value }) => [name, value])).toEqual([
            ['completed', 150],
            ['pending', 30],
            ['cancelled', 20],
        ]);
        expect(data[0].meta.rows).toHaveLength(2);
        expect(data[0].meta.value).toEqual({ raw: 150, formatted: '150' });
    });

    test('joins several group fields into the slice name', () => {
        const data = getPieChartData({
            resultsData: { rows: PIE_ROWS },
            groupFieldIds: ['orders_status', 'orders_region'],
            metricId: 'orders_revenue',
            selectedMetric: PIE_REVENUE_METRIC,
        });

        expect(data.map(({ name }) => name)).toEqual([
            'completed - EU',
            'completed - US',
            'pending - EU',
            'cancelled - US',
        ]);
    });

    test('returns no slices without a metric, groups or rows', () => {
        expect(
            getPieChartData({
                resultsData: { rows: PIE_ROWS },
                groupFieldIds: [],
                metricId: 'orders_revenue',
                selectedMetric: PIE_REVENUE_METRIC,
            }),
        ).toEqual([]);
        expect(
            getPieChartData({
                resultsData: { rows: [] },
                groupFieldIds: ['orders_status'],
                metricId: 'orders_revenue',
                selectedMetric: PIE_REVENUE_METRIC,
            }),
        ).toEqual([]);
        expect(
            getPieChartData({
                resultsData: { rows: PIE_ROWS },
                groupFieldIds: ['orders_status'],
                metricId: 'orders_missing',
                selectedMetric: PIE_REVENUE_METRIC,
            }),
        ).toEqual([]);
    });
});

describe('repairPieGroupFieldIds', () => {
    test('keeps groups that are in the results or pending', () => {
        expect(
            repairPieGroupFieldIds({
                groupFieldIds: ['orders_status', 'orders_gone', 'orders_new'],
                dimensionIds: ['orders_status', 'orders_region'],
                pendingDimensionIds: new Set(['orders_new']),
            }),
        ).toEqual(['orders_status', 'orders_new']);
    });

    test('falls back to the first dimension when no group is left', () => {
        expect(
            repairPieGroupFieldIds({
                groupFieldIds: ['orders_gone'],
                dimensionIds: ['orders_status', 'orders_region'],
                pendingDimensionIds: new Set(),
            }),
        ).toEqual(['orders_status']);
    });
});

describe('repairPieMetricId', () => {
    test('keeps an available metric', () => {
        expect(
            repairPieMetricId({
                metricId: 'orders_revenue',
                allNumericMetricIds: ['orders_revenue'],
                pendingMetricIds: new Set(),
            }),
        ).toBe('orders_revenue');
    });

    test('follows a renamed table calculation', () => {
        expect(
            repairPieMetricId({
                metricId: 'old_calc',
                allNumericMetricIds: ['orders_revenue', 'new_calc'],
                pendingMetricIds: new Set(),
                tableCalculationsMetadata: [
                    { name: 'new_calc', oldName: 'old_calc' },
                ],
            }),
        ).toBe('new_calc');
    });

    test('falls back to the first numeric metric', () => {
        expect(
            repairPieMetricId({
                metricId: 'orders_gone',
                allNumericMetricIds: ['orders_revenue'],
                pendingMetricIds: new Set(),
            }),
        ).toBe('orders_revenue');
        expect(
            repairPieMetricId({
                metricId: null,
                allNumericMetricIds: [],
                pendingMetricIds: new Set(),
            }),
        ).toBeNull();
    });
});

describe('getSortedPieGroupLabels', () => {
    test('uses the sort overrides that still match a group', () => {
        expect(
            getSortedPieGroupLabels(
                ['pending', 'gone', 'completed'],
                ['completed', 'pending', 'cancelled'],
            ),
        ).toEqual(['pending', 'completed']);
    });

    test('falls back to the data order without overrides', () => {
        expect(getSortedPieGroupLabels([], ['completed', 'pending'])).toEqual([
            'completed',
            'pending',
        ]);
    });
});

describe('isPieValueOptionOverridden', () => {
    test('detects a slice override of the given option only', () => {
        const overrides = { completed: { showValue: true } };
        expect(isPieValueOptionOverridden(overrides, 'showValue')).toBe(true);
        expect(isPieValueOptionOverridden(overrides, 'showPercentage')).toBe(
            false,
        );
    });
});

describe('buildValidPieConfig', () => {
    test('prunes overrides for groups that are gone and non-hex colors', () => {
        const validConfig = buildValidPieConfig({
            groupFieldIds: ['orders_status'],
            metricId: 'orders_revenue',
            isDonut: true,
            valueLabel: 'hidden',
            showValue: false,
            showPercentage: true,
            valueLabelColor: undefined,
            groupLabels: ['completed', 'pending'],
            groupLabelOverrides: { completed: 'Done', gone: 'Gone' },
            groupColorOverrides: { completed: '#ff0000', pending: 'red' },
            groupValueOptionOverrides: {
                completed: {},
                pending: { showValue: true },
            },
            groupSortOverrides: ['pending', 'gone', 'completed'],
            showLegend: true,
            legendPosition: 'horizontal',
            legendMaxItemLength: 30,
        });

        expect(validConfig).toEqual({
            groupFieldIds: ['orders_status'],
            metricId: 'orders_revenue',
            isDonut: true,
            valueLabel: 'hidden',
            showValue: false,
            showPercentage: true,
            valueLabelColor: undefined,
            groupLabelOverrides: { completed: 'Done' },
            groupColorOverrides: { completed: '#ff0000' },
            groupValueOptionOverrides: { pending: { showValue: true } },
            groupSortOverrides: ['pending', 'completed'],
            showLegend: true,
            legendPosition: 'horizontal',
            legendMaxItemLength: 30,
        });
    });
});

describe('resolvePieChartConfig', () => {
    const colorPalette = ['#111111', '#222222'];

    test('fills defaults and slices from the first dimension and metric of an empty config', () => {
        const resolved = resolvePieChartConfig({
            chartConfig: undefined,
            resultsData: { rows: PIE_ROWS },
            itemsMap: PIE_ITEMS_MAP,
            colorPalette,
        });

        expect(resolved.validConfig).toEqual({
            groupFieldIds: ['orders_status'],
            metricId: 'orders_revenue',
            isDonut: true,
            valueLabel: 'hidden',
            showValue: false,
            showPercentage: true,
            valueLabelColor: undefined,
            groupLabelOverrides: {},
            groupColorOverrides: {},
            groupValueOptionOverrides: {},
            groupSortOverrides: [],
            showLegend: true,
            legendPosition: 'horizontal',
            legendMaxItemLength: 30,
        });
        expect(resolved.selectedMetric).toBe(PIE_REVENUE_METRIC);
        expect(resolved.data.map(({ name, value }) => [name, value])).toEqual([
            ['completed', 150],
            ['pending', 30],
            ['cancelled', 20],
        ]);
        expect(resolved.sortedGroupLabels).toEqual([
            'completed',
            'pending',
            'cancelled',
        ]);
        expect(resolved.groupColorDefaults).toEqual({
            completed: '#111111',
            pending: '#222222',
            cancelled: '#111111',
        });
    });

    test('repairs a saved config whose fields left the results and keeps its overrides', () => {
        const resolved = resolvePieChartConfig({
            chartConfig: {
                groupFieldIds: ['orders_region', 'orders_gone'],
                metricId: 'orders_gone_metric',
                isDonut: false,
                valueLabel: 'outside',
                groupColorOverrides: { EU: '#00ff00' },
                groupSortOverrides: ['US', 'EU'],
                legendPosition: 'vertical',
            },
            resultsData: { rows: PIE_ROWS },
            itemsMap: PIE_ITEMS_MAP,
            colorPalette,
        });

        expect(resolved.validConfig.groupFieldIds).toEqual(['orders_region']);
        expect(resolved.validConfig.metricId).toBe('orders_revenue');
        expect(resolved.validConfig.isDonut).toBe(false);
        expect(resolved.validConfig.valueLabel).toBe('outside');
        expect(resolved.validConfig.legendPosition).toBe('vertical');
        expect(resolved.validConfig.groupColorOverrides).toEqual({
            EU: '#00ff00',
        });
        expect(resolved.data.map(({ name, value }) => [name, value])).toEqual([
            ['EU', 130],
            ['US', 70],
        ]);
        expect(resolved.sortedGroupLabels).toEqual(['US', 'EU']);
    });

    test('leaves the config untouched and slice-less while results are loading', () => {
        const resolved = resolvePieChartConfig({
            chartConfig: {
                groupFieldIds: ['orders_gone'],
                metricId: 'orders_gone_metric',
            },
            resultsData: undefined,
            itemsMap: PIE_ITEMS_MAP,
            colorPalette,
        });

        expect(resolved.validConfig.groupFieldIds).toEqual(['orders_gone']);
        expect(resolved.validConfig.metricId).toBe('orders_gone_metric');
        expect(resolved.data).toEqual([]);
    });
});
