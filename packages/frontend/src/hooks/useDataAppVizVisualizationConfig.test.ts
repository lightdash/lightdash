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

        expect(result.current.validConfig?.optionValues).toEqual({
            showLegend: false,
        });
        expect(result.current.validConfig?.optionValues).toEqual({
            showLegend: false,
        });
    });

    it('preserves the saved custom chart type version through config edits', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(
                { ...initialConfig, dataAppVizVersion: 7 },
                onConfigChange,
            ),
        );

        act(() => result.current.setField('value', 'orders_count'));

        expect(onConfigChange).toHaveBeenLastCalledWith({
            dataAppVizUuid: 'viz-1',
            dataAppVizVersion: 7,
            fieldMapping: {
                category: 'orders_status',
                value: 'orders_count',
            },
            optionValues: { showLegend: false },
            fieldOptionValues: {},
            fieldColorValues: {},
        });
    });

    it('pins the selected custom chart type to the rendered version', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() => result.current.setDataAppVizVersion(8));

        expect(result.current.validConfig?.dataAppVizVersion).toBe(8);
        expect(onConfigChange).toHaveBeenLastCalledWith({
            ...initialConfig,
            dataAppVizVersion: 8,
            fieldOptionValues: {},
            fieldColorValues: {},
        });
    });

    it('moves to a newer type version with the reconciled binding and options', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(
                { ...initialConfig, dataAppVizVersion: 3 },
                onConfigChange,
            ),
        );

        act(() =>
            result.current.upgradeDataAppVizVersion(
                5,
                { category: 'orders_status', value: 'orders_count' },
                {},
                {},
                {},
            ),
        );

        expect(onConfigChange).toHaveBeenLastCalledWith({
            dataAppVizUuid: 'viz-1',
            dataAppVizVersion: 5,
            fieldMapping: { category: 'orders_status', value: 'orders_count' },
            optionValues: {},
            fieldOptionValues: {},
            fieldColorValues: {},
        });
    });

    it('carries ordered multiple bindings through a version upgrade', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() =>
            result.current.upgradeDataAppVizVersion(
                5,
                {
                    category: 'orders_status',
                    values: ['orders_total', 'orders_count'],
                },
                {},
                {},
                {},
            ),
        );

        expect(onConfigChange).toHaveBeenLastCalledWith(
            expect.objectContaining({
                fieldMapping: {
                    category: 'orders_status',
                    values: ['orders_total', 'orders_count'],
                },
            }),
        );
    });

    it('drops stale multiple bindings when an upgrade supplies no binding', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(
                {
                    ...initialConfig,
                    fieldMapping: {
                        ...initialConfig.fieldMapping,
                        values: ['orders_total'],
                    },
                },
                onConfigChange,
            ),
        );

        act(() => result.current.upgradeDataAppVizVersion(5, {}, {}, {}, {}));

        expect(onConfigChange).toHaveBeenLastCalledWith({
            dataAppVizUuid: 'viz-1',
            dataAppVizVersion: 5,
            fieldMapping: {},
            optionValues: {},
            fieldOptionValues: {},
            fieldColorValues: {},
        });
    });

    it('ignores an upgrade while no type is selected', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(undefined, onConfigChange),
        );

        act(() => result.current.upgradeDataAppVizVersion(5, {}, {}, {}, {}));

        expect(onConfigChange).not.toHaveBeenCalled();
        expect(result.current.validConfig).toBeNull();
    });

    it('defaults to an empty option map when nothing is saved', () => {
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig({
                dataAppVizUuid: 'viz-1',
                fieldMapping: {},
            }),
        );

        expect(result.current.validConfig?.optionValues).toEqual({});
    });

    it('stores only explicitly set options and pushes them up', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() => result.current.setOption('viz-1', 'barColor', '#ff0000'));

        expect(result.current.validConfig?.optionValues).toEqual({
            showLegend: false,
            barColor: '#ff0000',
        });
        expect(onConfigChange).toHaveBeenCalledWith({
            dataAppVizUuid: 'viz-1',
            fieldMapping: { category: 'orders_status' },
            optionValues: { showLegend: false, barColor: '#ff0000' },
            fieldOptionValues: {},
            fieldColorValues: {},
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

        expect(result.current.validConfig?.optionValues).toEqual({
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
            fieldOptionValues: {},
            fieldColorValues: {},
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

        expect(result.current.validConfig?.fieldMapping).toEqual({
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
            fieldOptionValues: {},
            fieldColorValues: {},
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
            fieldOptionValues: {},
            fieldColorValues: {},
        });
    });

    it('persists an ordered multiple field binding, including an explicit clear', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() =>
            result.current.setField('values', [
                'orders_total',
                'orders_average_order_size',
            ]),
        );
        expect(result.current.validConfig?.fieldMapping).toEqual({
            category: 'orders_status',
            values: ['orders_total', 'orders_average_order_size'],
        });

        act(() => result.current.setField('values', []));
        expect(onConfigChange).toHaveBeenLastCalledWith(
            expect.objectContaining({
                fieldMapping: expect.objectContaining({ values: [] }),
            }),
        );
    });

    it('reopens scalar and multiple bindings without changing either', () => {
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig({
                dataAppVizUuid: 'viz-1',
                fieldMapping: {
                    category: 'orders_status',
                    values: ['orders_total', 'orders_average_order_size'],
                },
            }),
        );

        expect(result.current.validConfig?.fieldMapping).toEqual({
            category: 'orders_status',
            values: ['orders_total', 'orders_average_order_size'],
        });
    });

    it('clears option values when the viz is switched', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() => result.current.setDataAppVizUuid('viz-2', {}));

        expect(result.current.validConfig?.optionValues).toEqual({});
        expect(onConfigChange).toHaveBeenCalledWith({
            dataAppVizUuid: 'viz-2',
            fieldMapping: {},
            optionValues: {},
            fieldOptionValues: {},
            fieldColorValues: {},
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
        act(() => result.current.setDataAppVizUuid('viz-2', {}));
        onConfigChange.mockClear();
        act(() => result.current.setOption('viz-1', 'title', 'Revenue'));

        expect(result.current.validConfig?.optionValues).toEqual({});
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

        expect(result.current.validConfig?.optionValues).toEqual({
            showLegend: false,
            barColor: '#ff0000',
        });
        expect(onConfigChange).toHaveBeenCalledWith({
            dataAppVizUuid: 'viz-1',
            fieldMapping: { category: 'orders_status' },
            optionValues: { showLegend: false, barColor: '#ff0000' },
            fieldOptionValues: {},
            fieldColorValues: {},
        });
    });

    it('adopts a viz switched from outside without echoing it back', () => {
        const onConfigChange = vi.fn();
        const { result, rerender } = renderHook(
            ({ config }) =>
                useDataAppVizVisualizationConfig(config, onConfigChange),
            { initialProps: { config: initialConfig } },
        );

        act(() => result.current.setOption('viz-1', 'barColor', '#ff0000'));
        onConfigChange.mockClear();

        rerender({
            config: {
                dataAppVizUuid: 'viz-2',
                fieldMapping: { value: 'orders_total' },
                optionValues: {},
            },
        });

        expect(result.current.dataAppVizUuid).toBe('viz-2');
        expect(result.current.validConfig?.fieldMapping).toEqual({
            value: 'orders_total',
        });
        expect(result.current.validConfig?.optionValues).toEqual({});
        expect(onConfigChange).not.toHaveBeenCalled();

        act(() => result.current.setOption('viz-2', 'barColor', '#00ff00'));

        expect(onConfigChange).toHaveBeenCalledWith({
            dataAppVizUuid: 'viz-2',
            fieldMapping: { value: 'orders_total' },
            optionValues: { barColor: '#00ff00' },
            fieldOptionValues: {},
            fieldColorValues: {},
        });
    });

    it('keeps local edits when the same viz is echoed back', () => {
        const onConfigChange = vi.fn();
        const { result, rerender } = renderHook(
            ({ config }) =>
                useDataAppVizVisualizationConfig(config, onConfigChange),
            { initialProps: { config: initialConfig } },
        );

        act(() => result.current.setOption('viz-1', 'barColor', '#ff0000'));
        rerender({ config: { ...initialConfig } });

        expect(result.current.validConfig?.optionValues).toEqual({
            showLegend: false,
            barColor: '#ff0000',
        });
    });

    it('drops the pin when the same custom chart type is re-selected', () => {
        const { result, rerender } = renderHook(
            ({ config }) => useDataAppVizVisualizationConfig(config),
            {
                initialProps: {
                    config: {
                        ...initialConfig,
                        dataAppVizVersion: 3,
                    } as DataAppVizChart,
                },
            },
        );

        rerender({ config: initialConfig });

        expect(result.current.validConfig?.dataAppVizVersion).toBeUndefined();
    });

    it('points at no viz when the chart has no config', () => {
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(undefined),
        );

        expect(result.current.validConfig).toBeNull();
        expect(result.current.dataAppVizUuid).toBeNull();
    });

    it('reads the legacy empty uuid as no viz', () => {
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig({
                dataAppVizUuid: '',
                fieldMapping: {},
                optionValues: {},
            }),
        );

        expect(result.current.validConfig).toBeNull();
        expect(result.current.dataAppVizUuid).toBeNull();
    });

    it('reads a config with no uuid as no viz', () => {
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig({} as DataAppVizChart),
        );

        expect(result.current.validConfig).toBeNull();
        expect(result.current.dataAppVizUuid).toBeNull();
    });

    it('clears the selection and pushes the absence up', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() => result.current.clearDataAppViz());

        expect(result.current.validConfig).toBeNull();
        expect(onConfigChange).toHaveBeenCalledWith(null);
    });

    it('ignores field and option edits while no viz is selected', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(undefined, onConfigChange),
        );

        act(() => {
            result.current.setField('value', 'orders_count');
            result.current.setOption('viz-1', 'title', 'Revenue');
        });

        expect(result.current.validConfig).toBeNull();
        expect(onConfigChange).not.toHaveBeenCalled();
    });

    it('adopts an absent config from outside without echoing it back', () => {
        const onConfigChange = vi.fn();
        const { result, rerender } = renderHook(
            ({ config }) =>
                useDataAppVizVisualizationConfig(config, onConfigChange),
            {
                initialProps: {
                    config: initialConfig as DataAppVizChart | undefined,
                },
            },
        );

        rerender({ config: undefined });

        expect(result.current.validConfig).toBeNull();
        expect(onConfigChange).not.toHaveBeenCalled();
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

    it('keeps per-field edits independent and saves them with the chart', () => {
        const onConfigChange = vi.fn();
        const fieldMapping = { values: ['orders_total', 'orders_count'] };
        const rendered = { saved: fieldMapping, effective: fieldMapping };
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(
                { ...initialConfig, fieldMapping },
                onConfigChange,
            ),
        );
        act(() => {
            result.current.setFieldOption(
                'viz-1',
                undefined,
                rendered,
                'values',
                'orders_total',
                'color',
                '#ff0000',
            );
            result.current.setFieldOption(
                'viz-1',
                undefined,
                rendered,
                'values',
                'orders_count',
                'color',
                '#00ff00',
            );
        });
        expect(result.current.validConfig?.fieldOptionValues).toEqual({
            values: {
                orders_total: { color: '#ff0000' },
                orders_count: { color: '#00ff00' },
            },
        });
        const emitted = onConfigChange.mock.lastCall?.[0] as DataAppVizChart;
        expect(
            renderHook(() => useDataAppVizVisualizationConfig(emitted)).result
                .current.validConfig?.fieldOptionValues,
        ).toEqual(emitted.fieldOptionValues);
    });

    it('retains values on reorder and prunes removed or replaced bindings', () => {
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig({
                ...initialConfig,
                fieldMapping: { values: ['a', 'b'] },
                fieldOptionValues: {
                    values: { a: { color: 'red' }, b: { color: 'blue' } },
                },
            }),
        );
        act(() => result.current.setField('values', ['b', 'a']));
        expect(result.current.validConfig?.fieldOptionValues).toEqual({
            values: { a: { color: 'red' }, b: { color: 'blue' } },
        });
        act(() => result.current.setField('values', ['b']));
        expect(result.current.validConfig?.fieldOptionValues).toEqual({
            values: { b: { color: 'blue' } },
        });
        act(() => result.current.setField('values', ['c']));
        expect(result.current.validConfig?.fieldOptionValues).toEqual({});
    });

    it('uses defaults after a field is removed and added again', () => {
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig({
                ...initialConfig,
                fieldMapping: { values: ['a', 'b'] },
                fieldOptionValues: {
                    values: { a: { color: 'red' }, b: { color: 'blue' } },
                },
            }),
        );

        act(() => result.current.setField('values', ['b']));
        act(() => result.current.setField('values', ['b', 'a']));

        expect(result.current.validConfig?.fieldOptionValues).toEqual({
            values: { b: { color: 'blue' } },
        });
    });

    it('clears removed field settings on a schema upgrade', () => {
        const config = {
            ...initialConfig,
            dataAppVizVersion: 1,
            fieldMapping: { values: ['a'] },
            fieldOptionValues: { values: { a: { color: 'red' } } },
        };
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(config),
        );

        act(() =>
            result.current.upgradeDataAppVizVersion(
                2,
                { values: ['a'] },
                {},
                {},
                {},
            ),
        );

        expect(result.current.validConfig?.fieldOptionValues).toEqual({});
    });

    it('rejects a debounced field edit after its binding was replaced', () => {
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig),
        );
        const staleEdit = result.current.setFieldOption;
        act(() => result.current.setField('category', 'orders_region'));
        act(() =>
            staleEdit(
                'viz-1',
                undefined,
                {
                    saved: initialConfig.fieldMapping,
                    effective: initialConfig.fieldMapping,
                },
                'category',
                'orders_status',
                'color',
                'red',
            ),
        );
        expect(result.current.validConfig?.fieldOptionValues).toEqual({});
    });

    it('rejects a pending field edit from the previous pinned version', () => {
        const config = {
            ...initialConfig,
            dataAppVizVersion: 1,
            fieldMapping: { values: ['a'] },
        };
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(config),
        );

        act(() =>
            result.current.upgradeDataAppVizVersion(
                2,
                { values: ['a'] },
                {},
                {},
                {},
            ),
        );
        act(() =>
            result.current.setFieldOption(
                'viz-1',
                1,
                { saved: { values: ['a'] }, effective: { values: ['a'] } },
                'values',
                'a',
                'color',
                'red',
            ),
        );

        expect(result.current.validConfig?.fieldOptionValues).toEqual({});
    });

    it('saves a field edit made against a reconciled binding', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );
        const rendered = {
            saved: initialConfig.fieldMapping,
            effective: { category: 'orders_region' },
        };

        act(() => {
            result.current.setFieldOption(
                'viz-1',
                undefined,
                rendered,
                'category',
                'orders_region',
                'color',
                'red',
            );
            result.current.setFieldOption(
                'viz-1',
                undefined,
                rendered,
                'category',
                'orders_region',
                'label',
                'Region',
            );
        });

        expect(onConfigChange).toHaveBeenLastCalledWith({
            dataAppVizUuid: 'viz-1',
            dataAppVizVersion: undefined,
            fieldMapping: { category: 'orders_region' },
            optionValues: { showLegend: false },
            fieldOptionValues: {
                category: { orders_region: { color: 'red', label: 'Region' } },
            },
            fieldColorValues: {},
        });
    });

    it('rejects a field edit for a field the rendered binding does not hold', () => {
        const onConfigChange = vi.fn();
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initialConfig, onConfigChange),
        );

        act(() =>
            result.current.setFieldOption(
                'viz-1',
                undefined,
                {
                    saved: initialConfig.fieldMapping,
                    effective: { category: 'orders_region' },
                },
                'category',
                'orders_status',
                'color',
                'red',
            ),
        );

        expect(onConfigChange).not.toHaveBeenCalled();
    });

    it('saves independent gradient edits and discards removed bindings', () => {
        const onConfigChange = vi.fn();
        const declaredDefault = {
            enabled: false,
            start: '#000000',
            end: '#ffffff',
            min: 'auto',
            max: 'auto',
        } as const;
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(
                {
                    ...initialConfig,
                    fieldMapping: { values: ['a', 'b'] },
                },
                onConfigChange,
            ),
        );

        act(() => {
            result.current.setFieldGradient(
                'viz-1',
                undefined,
                'values',
                'a',
                declaredDefault,
                { enabled: true },
            );
            result.current.setFieldGradient(
                'viz-1',
                undefined,
                'values',
                'a',
                declaredDefault,
                { start: '#ff0000' },
            );
            result.current.setFieldGradient(
                'viz-1',
                undefined,
                'values',
                'b',
                declaredDefault,
                { end: '#00ff00' },
            );
        });
        expect(result.current.validConfig?.fieldColorValues).toEqual({
            values: {
                a: {
                    gradient: {
                        ...declaredDefault,
                        enabled: true,
                        start: '#ff0000',
                    },
                },
                b: { gradient: { ...declaredDefault, end: '#00ff00' } },
            },
        });
        const saved = onConfigChange.mock.lastCall?.[0] as DataAppVizChart;
        expect(
            renderHook(() => useDataAppVizVisualizationConfig(saved)).result
                .current.validConfig?.fieldColorValues,
        ).toEqual(saved.fieldColorValues);

        act(() => result.current.setField('values', ['b', 'a']));
        expect(
            result.current.validConfig?.fieldColorValues?.values?.a,
        ).toBeDefined();
        act(() => result.current.setField('values', ['b']));
        act(() => result.current.setField('values', ['b', 'a']));
        expect(result.current.validConfig?.fieldColorValues).toEqual({
            values: { b: { gradient: { ...declaredDefault, end: '#00ff00' } } },
        });
    });

    it('clears gradients on upgrade and rejects pending edits from the old version', () => {
        const gradient = {
            enabled: true,
            start: '#000000',
            end: '#ffffff',
            min: 'auto',
            max: 'auto',
        } as const;
        const initial: DataAppVizChart = {
            ...initialConfig,
            dataAppVizVersion: 1,
            fieldMapping: { values: ['a'] },
            fieldColorValues: {
                values: {
                    a: {
                        gradient,
                        rules: [
                            {
                                enabled: true,
                                color: '#ff0000',
                                operator: 'eq',
                                value: 1,
                            },
                        ],
                    },
                },
            },
        };
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initial),
        );

        act(() =>
            result.current.upgradeDataAppVizVersion(
                2,
                { values: ['a'] },
                {},
                {},
                {},
            ),
        );
        act(() =>
            result.current.setFieldGradient(
                'viz-1',
                1,
                'values',
                'a',
                gradient,
                { end: '#ff0000' },
            ),
        );
        act(() =>
            result.current.setFieldRules(
                'viz-1',
                1,
                'values',
                'a',
                [],
                (rules) => [
                    ...rules,
                    {
                        enabled: true,
                        color: '#00ff00',
                        operator: 'gt',
                        value: 2,
                    },
                ],
            ),
        );

        expect(result.current.validConfig?.fieldColorValues).toEqual({});
    });

    it('keeps rules and gradients independent through rapid edits and save', () => {
        const gradient = {
            enabled: true,
            start: '#000000',
            end: '#ffffff',
            min: 'auto',
            max: 'auto',
        } as const;
        const declaredRules = [
            { enabled: true, color: '#ff0000', operator: 'gt', value: 5 },
        ] as const;
        const onConfigChange = vi.fn();
        const initial = {
            ...initialConfig,
            fieldMapping: { values: ['a', 'b'] },
            fieldColorValues: { values: { a: { gradient } } },
        };
        const { result } = renderHook(() =>
            useDataAppVizVisualizationConfig(initial, onConfigChange),
        );

        act(() => {
            result.current.setFieldRules(
                'viz-1',
                undefined,
                'values',
                'a',
                [...declaredRules],
                (rules) => [
                    ...rules,
                    {
                        enabled: true,
                        color: '#00ff00',
                        operator: 'lt',
                        value: 2,
                    },
                ],
            );
            result.current.setFieldRules(
                'viz-1',
                undefined,
                'values',
                'a',
                [...declaredRules],
                (rules) =>
                    rules.map((rule, index) =>
                        index === 1 ? { ...rule, color: '#0000ff' } : rule,
                    ),
            );
            result.current.setFieldGradient(
                'viz-1',
                undefined,
                'values',
                'a',
                gradient,
                { end: '#aaaaaa' },
            );
        });

        expect(result.current.validConfig?.fieldColorValues?.values.a).toEqual({
            gradient: { ...gradient, end: '#aaaaaa' },
            rules: [
                declaredRules[0],
                { enabled: true, color: '#0000ff', operator: 'lt', value: 2 },
            ],
        });
        const saved = onConfigChange.mock.lastCall?.[0] as DataAppVizChart;
        expect(
            renderHook(() => useDataAppVizVisualizationConfig(saved)).result
                .current.validConfig?.fieldColorValues,
        ).toEqual(saved.fieldColorValues);

        act(() =>
            result.current.setFieldRules(
                'viz-1',
                undefined,
                'values',
                'a',
                [...declaredRules],
                () => [],
            ),
        );
        expect(
            result.current.validConfig?.fieldColorValues?.values.a.rules,
        ).toEqual([]);
        expect(
            result.current.validConfig?.fieldColorValues?.values.a.gradient,
        ).toEqual({ ...gradient, end: '#aaaaaa' });
        act(() => result.current.setField('values', ['b']));
        act(() => result.current.setField('values', ['b', 'a']));
        expect(result.current.validConfig?.fieldColorValues).toEqual({});
    });
});
