import {
    ChartKind,
    Compact,
    ComparisonFormatTypes,
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
    setComparisonAggregation,
    setComparisonFormat,
    setComparisonLabel,
    setComparisonReference,
    setFlipColors,
    setLabel,
    setShowComparison,
    setShowLabel,
    setStyle,
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

    describe('comparison field', () => {
        const withOptions = () =>
            reducer(undefined, setChartOptionsAndConfig(optionsAndConfig));

        it('adds the comparison field after the value field', () => {
            const state = reducer(
                withOptions(),
                setComparisonReference('target'),
            );

            expect(state.fieldConfig?.y).toEqual([
                {
                    reference: 'revenue',
                    aggregation: VizAggregationOptions.SUM,
                },
                { reference: 'target', aggregation: VizAggregationOptions.MAX },
            ]);
        });

        it('clears the comparison field', () => {
            const withComparison = reducer(
                withOptions(),
                setComparisonReference('target'),
            );

            expect(
                reducer(withComparison, setComparisonReference(undefined))
                    .fieldConfig?.y,
            ).toHaveLength(1);
        });

        it('drops the comparison field when the comparison is switched off', () => {
            const withComparison = reducer(
                reducer(withOptions(), setShowComparison(true)),
                setComparisonReference('target'),
            );

            const state = reducer(withComparison, setShowComparison(false));

            expect(state.display?.showComparison).toBe(false);
            expect(state.fieldConfig?.y).toHaveLength(1);
        });

        it('keeps the value field when the comparison is switched on', () => {
            const state = reducer(withOptions(), setShowComparison(true));

            expect(state.display?.showComparison).toBe(true);
            expect(state.fieldConfig?.y).toHaveLength(1);
        });

        it('overrides the comparison aggregation', () => {
            const withComparison = reducer(
                withOptions(),
                setComparisonReference('target'),
            );

            expect(
                reducer(
                    withComparison,
                    setComparisonAggregation(VizAggregationOptions.MIN),
                ).fieldConfig?.y[1].aggregation,
            ).toBe(VizAggregationOptions.MIN);
        });
    });

    describe('display options', () => {
        it('updates each display option without touching the others', () => {
            let state = reducer(undefined, setLabel('Total revenue'));
            state = reducer(state, setShowLabel(false));
            state = reducer(state, setStyle(Compact.MILLIONS));
            state = reducer(
                state,
                setComparisonFormat(ComparisonFormatTypes.PERCENTAGE),
            );
            state = reducer(state, setComparisonLabel('vs target'));
            state = reducer(state, setFlipColors(true));

            expect(state.display).toEqual({
                label: 'Total revenue',
                showLabel: false,
                style: Compact.MILLIONS,
                comparisonFormat: ComparisonFormatTypes.PERCENTAGE,
                comparisonLabel: 'vs target',
                flipColors: true,
            });
        });

        it('clears the label back to the default', () => {
            const withLabel = reducer(undefined, setLabel('Total revenue'));

            expect(
                reducer(withLabel, setLabel(undefined)).display?.label,
            ).toBeUndefined();
        });
    });
});
