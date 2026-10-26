import {
    ChartType,
    FunnelChartDataInput,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    type FunnelChart,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withVisualizationStore } from '../testing/visualizationStore';
import useFunnelChartConfig from './useFunnelChartConfig';

const render = (config?: FunnelChart) =>
    renderHook(() => useFunnelChartConfig(), {
        wrapper: withVisualizationStore(
            { type: ChartType.FUNNEL, config },
            { colorPalette: ['#000'] },
        ),
    });

describe('useFunnelChartConfig', () => {
    it('seeds from the saved config', () => {
        const { result } = render({
            fieldId: 'orders_count',
            dataInput: FunnelChartDataInput.COLUMN,
            showLegend: false,
        });
        expect(result.current.fieldId).toBe('orders_count');
        expect(result.current.dataInput).toBe(FunnelChartDataInput.COLUMN);
        expect(result.current.showLegend).toBe(false);
    });

    it('merges labels, toggles the legend and sets the position', () => {
        const { result } = render(undefined);
        act(() =>
            result.current.onLabelsChange({
                position: FunnelChartLabelPosition.LEFT,
            }),
        );
        act(() => result.current.onLabelsChange({ showValue: true }));
        expect(result.current.labels).toMatchObject({
            position: FunnelChartLabelPosition.LEFT,
            showValue: true,
        });
        const before = result.current.showLegend;
        act(() => result.current.toggleShowLegend());
        expect(result.current.showLegend).toBe(!before);
        act(() =>
            result.current.legendPositionChange(
                FunnelChartLegendPosition.VERTICAL,
            ),
        );
        expect(result.current.legendPosition).toBe(
            FunnelChartLegendPosition.VERTICAL,
        );
    });

    it('drops a label or color override when it is blank', () => {
        const { result } = render(undefined);
        act(() => result.current.onLabelOverridesChange('a', 'Step A'));
        act(() => result.current.onColorOverridesChange('a', '#111'));
        expect(result.current.labelOverrides).toEqual({ a: 'Step A' });
        expect(result.current.colorOverrides).toEqual({ a: '#111' });
        expect(result.current.validConfig.labelOverrides).toEqual({
            a: 'Step A',
        });
        act(() => result.current.onLabelOverridesChange('a', '  '));
        act(() => result.current.onColorOverridesChange('a', ''));
        expect(result.current.labelOverrides).toEqual({});
        expect(result.current.colorOverrides).toEqual({});
    });
});
