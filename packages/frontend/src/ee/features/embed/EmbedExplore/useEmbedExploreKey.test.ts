import {
    ChartType,
    type CreateSavedChartVersion,
    type SavedChart,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEmbedExploreKey } from './useEmbedExploreKey';

const drilledChart = (): CreateSavedChartVersion => ({
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.TABLE },
    tableConfig: { columnOrder: [] },
});

const savedChart = (): SavedChart =>
    ({ ...drilledChart(), uuid: 'chart-uuid' }) as SavedChart;

const renderKey = (chart: SavedChart | CreateSavedChartVersion | undefined) =>
    renderHook(
        (props: { chart: SavedChart | CreateSavedChartVersion | undefined }) =>
            useEmbedExploreKey({
                exploreId: 'orders',
                savedChart: props.chart,
                allowChartUpdate: false,
            }),
        { initialProps: { chart } },
    );

describe('embedded explore content key', () => {
    it('changes when a new drilled chart replaces the previous one', () => {
        const first = drilledChart();
        const { result, rerender } = renderKey(first);
        const initialKey = result.current;

        rerender({ chart: first });
        expect(result.current).toBe(initialKey);

        rerender({ chart: drilledChart() });
        expect(result.current).not.toBe(initialKey);
    });

    it('keys saved charts by uuid regardless of object identity', () => {
        const { result, rerender } = renderKey(savedChart());
        const initialKey = result.current;

        rerender({ chart: savedChart() });
        expect(result.current).toBe(initialKey);
        expect(initialKey).toContain('chart-uuid');
    });
});
