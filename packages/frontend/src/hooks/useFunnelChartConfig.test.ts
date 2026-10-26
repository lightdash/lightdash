import {
    ChartType,
    FunnelChartDataInput,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    type FunnelChart,
    type ItemsMap,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    fields,
    results,
} from '../components/LightdashVisualization/visualizationDifferential.fixtures';
import {
    tableCalculationsRenamed,
    useVisualizationDispatch,
} from '../features/visualization/store';
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

    describe('table calculation renames', () => {
        // The explorer's view after a run: the TC is renamed and the rename metadata cleared
        const renderRenamed = (name: string) => {
            const { margin, ...rest } = fields;
            const itemsMap: ItemsMap = {
                ...rest,
                [name]: { ...margin, name, sql: '1' },
            };
            return renderHook(
                () => ({
                    config: useFunnelChartConfig(),
                    dispatch: useVisualizationDispatch(),
                }),
                {
                    wrapper: withVisualizationStore(
                        {
                            type: ChartType.FUNNEL,
                            config: { fieldId: 'margin' },
                        },
                        { itemsMap, resultsData: results },
                    ),
                },
            );
        };

        it('keeps the renamed field after the run clears the rename', () => {
            const { result } = renderRenamed('margin2');
            act(() => {
                result.current.dispatch(
                    tableCalculationsRenamed([
                        { oldName: 'margin', name: 'margin2' },
                    ]),
                );
            });
            expect(result.current.config.validConfig.fieldId).toBe('margin2');
        });

        it('follows a field renamed twice', () => {
            const { result } = renderRenamed('margin3');
            act(() => {
                result.current.dispatch(
                    tableCalculationsRenamed([
                        { oldName: 'margin', name: 'margin2' },
                    ]),
                );
                result.current.dispatch(
                    tableCalculationsRenamed([
                        { oldName: 'margin2', name: 'margin3' },
                    ]),
                );
            });
            expect(result.current.config.validConfig.fieldId).toBe('margin3');
        });
    });
});
