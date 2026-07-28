import { type DataAppVizChart } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import useDataAppVizVisualizationConfig from './useDataAppVizVisualizationConfig';

const initialConfig: DataAppVizChart = {
    dataAppVizUuid: 'viz-1',
    fieldMapping: { category: 'orders_status' },
    optionValues: { showLegend: false },
};

describe('useDataAppVizVisualizationConfig', () => {
    it('starts from the saved option values', () => {
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig),
        );

        expect(result.current.optionValues).toEqual({ showLegend: false });
        expect(result.current.validConfig.optionValues).toEqual({
            showLegend: false,
        });
    });

    it('defaults to an empty option map when nothing is saved', () => {
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig({
                dataAppVizUuid: 'viz-1',
                fieldMapping: {},
            }),
        );

        expect(result.current.optionValues).toEqual({});
    });

    it('stores only explicitly set options and pushes them up', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() => result.current.setOption('viz-1', 'barColor', '#ff0000'));

        expect(result.current.optionValues).toEqual({
            showLegend: false,
            barColor: '#ff0000',
        });
        expect(onConfigChange).toHaveBeenCalledWith({
            dataAppVizUuid: 'viz-1',
            fieldMapping: { category: 'orders_status' },
            optionValues: { showLegend: false, barColor: '#ff0000' },
        });
    });

    it('keeps both option edits when two controls flush in the same commit', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        // Closing the config panel flushes every pending debounced control
        // synchronously, with no re-render between them.
        act(() => {
            result.current.setOption('viz-1', 'barColor', '#ff0000');
            result.current.setOption('viz-1', 'title', 'Revenue');
        });

        expect(result.current.optionValues).toEqual({
            showLegend: false,
            barColor: '#ff0000',
            title: 'Revenue',
        });
        expect(onConfigChange).toHaveBeenLastCalledWith({
            dataAppVizUuid: 'viz-1',
            fieldMapping: { category: 'orders_status' },
            optionValues: {
                showLegend: false,
                barColor: '#ff0000',
                title: 'Revenue',
            },
        });
    });

    it('keeps both field edits when two selects change in the same commit', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() => {
            result.current.setField('value', 'orders_count');
            result.current.setField('series', 'orders_channel');
        });

        expect(result.current.fieldMapping).toEqual({
            category: 'orders_status',
            value: 'orders_count',
            series: 'orders_channel',
        });
        expect(onConfigChange).toHaveBeenLastCalledWith({
            dataAppVizUuid: 'viz-1',
            fieldMapping: {
                category: 'orders_status',
                value: 'orders_count',
                series: 'orders_channel',
            },
            optionValues: { showLegend: false },
        });
    });

    it('keeps option values when only a field mapping changes', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() => result.current.setField('value', 'orders_count'));

        expect(onConfigChange).toHaveBeenCalledWith({
            dataAppVizUuid: 'viz-1',
            fieldMapping: {
                category: 'orders_status',
                value: 'orders_count',
            },
            optionValues: { showLegend: false },
        });
    });

    it('clears option values when the viz is switched', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() => result.current.setDataAppVizUuid('viz-2'));

        expect(result.current.optionValues).toEqual({});
        expect(onConfigChange).toHaveBeenCalledWith({
            dataAppVizUuid: 'viz-2',
            fieldMapping: {},
            optionValues: {},
        });
    });

    it('drops a late option edit belonging to a viz that is no longer selected', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        // The user picks another viz while a debounced control still holds an
        // edit; the control flushes it from its unmount cleanup, after the
        // switch has already committed.
        act(() => result.current.setDataAppVizUuid('viz-2'));
        onConfigChange.mockClear();
        act(() => result.current.setOption('viz-1', 'title', 'Revenue'));

        expect(result.current.optionValues).toEqual({});
        expect(onConfigChange).not.toHaveBeenCalled();
    });

    it('drops a late option edit once this config no longer owns the chart', () => {
        const onConfigChange = vi.fn();
        const { result, unmount } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );
        const { setOption } = result.current;

        // Switching chart type unmounts this config; a control flushing after
        // that must not write a data-app-viz config back over the new one.
        unmount();
        act(() => setOption('viz-1', 'title', 'Revenue'));

        expect(onConfigChange).not.toHaveBeenCalled();
    });

    it('still writes options after a StrictMode remount', () => {
        const onConfigChange = vi.fn();
        // StrictMode runs setup → cleanup → setup on mount, so ownership has
        // to survive a remount, not just be dropped on unmount.
        const { result } = renderHook(
            () =>
                useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
            { wrapper: StrictMode },
        );

        act(() => result.current.setOption('viz-1', 'barColor', '#ff0000'));

        expect(result.current.optionValues).toEqual({
            showLegend: false,
            barColor: '#ff0000',
        });
        expect(onConfigChange).toHaveBeenCalledWith({
            dataAppVizUuid: 'viz-1',
            fieldMapping: { category: 'orders_status' },
            optionValues: { showLegend: false, barColor: '#ff0000' },
        });
    });

    it('round-trips the emitted config back into a fresh hook', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() => result.current.setOption('viz-1', 'barCount', 12));
        const emitted = onConfigChange.mock
            .calls[0][0] as unknown as DataAppVizChart;

        const reloaded = renderHook(() =>
            useDataAppVizVisualizationConfig(emitted),
        );

        expect(reloaded.result.current.validConfig).toEqual(emitted);
    });
});
