import {
    ChartKind,
    VizAggregationOptions,
    type VizBigNumberConfig,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    resetChartState,
    setChartConfig,
    setChartOptionsAndConfig,
} from './actions/commonChartActions';
import {
    bigNumberConfigSlice,
    setValueAggregation,
    setValueReference,
} from './bigNumberSlice';

const { reducer } = bigNumberConfigSlice;

const config: VizBigNumberConfig = {
    type: ChartKind.BIG_NUMBER,
    metadata: { version: 1 },
    fieldConfig: {
        x: undefined,
        y: [{ reference: 'revenue', aggregation: VizAggregationOptions.SUM }],
        groupBy: [],
    },
    display: { label: 'Revenue' },
};

const optionsAndConfig: Parameters<typeof setChartOptionsAndConfig>[0] = {
    type: ChartKind.BIG_NUMBER,
    options: {
        metricFieldOptions: [
            { reference: 'revenue', aggregation: VizAggregationOptions.SUM },
            { reference: 'target', aggregation: VizAggregationOptions.MAX },
        ],
        customMetricFieldOptions: [],
    },
    config,
    errors: undefined,
};

describe('bigNumberConfigSlice', () => {
    it('adopts the field config and options the first time they are computed', () => {
        const state = reducer(
            undefined,
            setChartOptionsAndConfig(optionsAndConfig),
        );

        expect(state.fieldConfig).toEqual(config.fieldConfig);
        expect(state.options.metricFieldOptions).toHaveLength(2);
    });

    it('ignores options computed for a different chart kind', () => {
        const state = reducer(
            undefined,
            setChartOptionsAndConfig({
                type: ChartKind.PIE,
                options: {
                    groupFieldOptions: [],
                    metricFieldOptions: [],
                    customMetricFieldOptions: [],
                },
                config: {
                    type: ChartKind.PIE,
                    metadata: { version: 1 },
                    fieldConfig: undefined,
                    display: {},
                },
                errors: undefined,
            }),
        );

        expect(state.fieldConfig).toBeUndefined();
    });

    it('replaces the value field and picks up its default aggregation', () => {
        const withOptions = reducer(
            undefined,
            setChartOptionsAndConfig(optionsAndConfig),
        );

        const state = reducer(withOptions, setValueReference('target'));

        expect(state.fieldConfig?.y[0]).toEqual({
            reference: 'target',
            aggregation: VizAggregationOptions.MAX,
        });
    });

    it('overrides the aggregation of the value field', () => {
        const withOptions = reducer(
            undefined,
            setChartOptionsAndConfig(optionsAndConfig),
        );

        const state = reducer(
            withOptions,
            setValueAggregation(VizAggregationOptions.AVERAGE),
        );

        expect(state.fieldConfig?.y[0].aggregation).toBe(
            VizAggregationOptions.AVERAGE,
        );
    });

    it('loads a saved chart config', () => {
        const state = reducer(undefined, setChartConfig(config));

        expect(state.fieldConfig).toEqual(config.fieldConfig);
        expect(state.display).toEqual({ label: 'Revenue' });
    });

    it('ignores a saved config for another chart kind', () => {
        const state = reducer(
            undefined,
            setChartConfig({
                type: ChartKind.TABLE,
                metadata: { version: 1 },
                columns: {},
                display: {},
            }),
        );

        expect(state.fieldConfig).toBeUndefined();
    });

    it('resets back to the initial state', () => {
        const withConfig = reducer(undefined, setChartConfig(config));

        expect(
            reducer(withConfig, resetChartState()).fieldConfig,
        ).toBeUndefined();
    });
});
