import {
    CartesianSeriesType,
    ChartKind,
    CustomFormatType,
    Format,
    VizAggregationOptions,
    VizIndexType,
    type VizCartesianChartConfig,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { setChartConfig } from './actions/commonChartActions';
import { barChartConfigSlice } from './barChartSlice';
import { lineChartConfigSlice } from './lineChartSlice';

describe.each([
    { type: ChartKind.VERTICAL_BAR, slice: barChartConfigSlice },
    { type: ChartKind.LINE, slice: lineChartConfigSlice },
] as const)('$type series draw order', ({ type, slice }) => {
    const config: VizCartesianChartConfig = {
        type,
        metadata: { version: 1 },
        fieldConfig: {
            x: { reference: 'month', type: VizIndexType.CATEGORY },
            y: ['target', 'sales'].map((reference) => ({
                reference,
                aggregation: VizAggregationOptions.SUM,
            })),
            groupBy: [],
        },
        display: {
            series: {
                target: { type: CartesianSeriesType.LINE, color: '#ff0000' },
                sales: { type: CartesianSeriesType.BAR, label: 'Sales' },
            },
        },
    };

    it('saves the order independently of query fields and series settings', () => {
        const initial = slice.reducer(undefined, setChartConfig(config));
        const reordered = slice.reducer(
            initial,
            slice.actions.setSeriesOrder(['sales', 'target']),
        );

        expect(reordered.display?.seriesOrder).toEqual(['sales', 'target']);
        expect(reordered.display?.series).toEqual(config.display?.series);
        expect(reordered.fieldConfig).toBe(initial.fieldConfig);
        expect(initial.display?.seriesOrder).toBeUndefined();

        const reloaded = slice.reducer(
            undefined,
            setChartConfig({ ...config, display: reordered.display }),
        );
        expect(reloaded.display?.seriesOrder).toEqual(['sales', 'target']);

        const edited = slice.reducer(
            reloaded,
            slice.actions.setSeriesLabel({
                reference: 'target',
                label: 'Goal',
            }),
        );
        expect(edited.display?.seriesOrder).toEqual(['sales', 'target']);
    });

    it('initializes display when ordering a chart without saved display settings', () => {
        const initial = slice.reducer(
            undefined,
            setChartConfig({ ...config, display: undefined }),
        );
        const reordered = slice.reducer(
            initial,
            slice.actions.setSeriesOrder(['sales', 'target']),
        );
        expect(reordered.display).toEqual({ seriesOrder: ['sales', 'target'] });
    });

    it('stores and resets a custom value label color', () => {
        const initial = slice.reducer(undefined, setChartConfig(config));
        const customized = slice.reducer(
            initial,
            slice.actions.setSeriesValueLabelColor({
                reference: 'sales',
                color: '#ff00ff',
            }),
        );
        const reset = slice.reducer(
            customized,
            slice.actions.setSeriesValueLabelColor({
                reference: 'sales',
                color: undefined,
            }),
        );

        expect(customized.display?.series?.sales.valueLabelColor).toBe(
            '#ff00ff',
        );
        expect(reset.display?.series?.sales.valueLabelColor).toBeUndefined();
    });

    it('builds y-axis format options field by field, replacing the legacy preset', () => {
        const initial = slice.reducer(
            undefined,
            setChartConfig({
                ...config,
                display: {
                    ...config.display,
                    yAxis: [{ label: 'Revenue', format: Format.PERCENT }],
                },
            }),
        );

        const rounded = slice.reducer(
            initial,
            slice.actions.setYAxisFormatOption({
                index: 0,
                path: 'round',
                value: 1,
            }),
        );
        expect(rounded.display?.yAxis?.[0]).toEqual({
            label: 'Revenue',
            formatOptions: { type: CustomFormatType.PERCENT, round: 1 },
        });

        // The format form sends these updates back to back on a type change
        const currency = (
            [
                ['type', CustomFormatType.CURRENCY],
                ['compact', undefined],
                ['custom', undefined],
                ['currency', 'AUD'],
            ] as const
        ).reduce(
            (state, [path, value]) =>
                slice.reducer(
                    state,
                    slice.actions.setYAxisFormatOption({
                        index: 0,
                        path,
                        value,
                    }),
                ),
            rounded,
        );
        expect(currency.display?.yAxis?.[0]).toEqual({
            label: 'Revenue',
            formatOptions: {
                type: CustomFormatType.CURRENCY,
                currency: 'AUD',
                round: 1,
            },
        });

        const cleared = slice.reducer(
            currency,
            slice.actions.setYAxisFormatOption({
                index: 0,
                path: 'type',
                value: CustomFormatType.DEFAULT,
            }),
        );
        expect(cleared.display?.yAxis?.[0]).toEqual({ label: 'Revenue' });
    });

    it('initializes display when formatting a chart without saved display settings', () => {
        const initial = slice.reducer(
            undefined,
            setChartConfig({ ...config, display: undefined }),
        );
        const formatted = slice.reducer(
            initial,
            slice.actions.setYAxisFormatOption({
                index: 1,
                path: 'type',
                value: CustomFormatType.PERCENT,
            }),
        );
        expect(formatted.display?.yAxis).toEqual([
            {},
            { formatOptions: { type: CustomFormatType.PERCENT } },
        ]);
    });
});
