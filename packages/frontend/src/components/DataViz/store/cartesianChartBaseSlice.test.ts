import {
    CartesianSeriesType,
    ChartKind,
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
});
