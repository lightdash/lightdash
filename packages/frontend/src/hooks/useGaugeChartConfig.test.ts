import {
    ChartType,
    FieldType,
    MetricType,
    type CompiledMetric,
    type GaugeChart,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withVisualizationStore } from '../testing/visualizationStore';
import useGaugeChartConfig from './useGaugeChartConfig';

const revenue: CompiledMetric = {
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
};

const render = (config: GaugeChart | undefined) =>
    renderHook(() => useGaugeChartConfig(), {
        wrapper: withVisualizationStore(
            { type: ChartType.GAUGE, config },
            { itemsMap: { orders_revenue: revenue } },
        ),
    });

describe('useGaugeChartConfig', () => {
    it('falls back to the first numeric field without writing it back', () => {
        const { result } = render(undefined);

        expect(result.current.selectedField).toBe('orders_revenue');
        expect(result.current.validConfig.selectedField).toBe('orders_revenue');
    });

    it('adds, updates and removes sections', () => {
        const { result } = render({ selectedField: 'orders_revenue', max: 50 });

        act(() => result.current.addSection());
        expect(result.current.sections).toEqual([
            { min: 0, max: 50, color: '#5470c6' },
        ]);

        act(() => result.current.addSection());
        act(() =>
            result.current.updateSection(1, {
                color: '#ff0000',
            }),
        );
        expect(result.current.sections[1]).toEqual({
            min: 0,
            max: 50,
            color: '#ff0000',
        });

        act(() => result.current.removeSection(0));
        expect(result.current.validConfig.sections).toEqual([
            { min: 0, max: 50, color: '#ff0000' },
        ]);
    });

    it('ignores an update for a section that is gone', () => {
        const { result } = render({ selectedField: 'orders_revenue' });
        act(() => result.current.addSection());
        act(() => result.current.removeSection(0));
        act(() => result.current.updateSection(0, { min: 42 }));
        expect(result.current.validConfig.sections).toEqual([]);
    });

    it('keeps the config identity across an unrelated re-render', () => {
        const { result, rerender } = render({
            selectedField: 'orders_revenue',
        });
        const before = result.current.validConfig;
        rerender();
        expect(result.current.validConfig).toBe(before);
    });
});
