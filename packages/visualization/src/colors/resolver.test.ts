import {
    CartesianSeriesType,
    ChartType,
    OTHER_PIVOT_KEY,
    type CartesianChartConfig,
    type Series,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { createSeriesColorResolver } from './resolver';

const NEUTRAL = '#868e96';
const OTHER = '#ced4da';
const PALETTE = ['#ff0000', '#00ff00', '#0000ff'];

const pivotSeries = (value: unknown, color?: string): Series => ({
    type: CartesianSeriesType.BAR,
    encode: {
        xRef: { field: 'orders_date' },
        yRef: {
            field: 'orders_total',
            pivotValues: [{ field: 'orders_status', value }],
        },
    },
    ...(color ? { color } : {}),
});

const resolverFor = (series: Series[], otherColor?: string) => {
    const chartConfig: CartesianChartConfig = {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'orders_date', yField: ['orders_total'] },
            eChartsConfig: { series },
        },
    };
    return createSeriesColorResolver({
        colorPalette: PALETTE,
        colorMappings: new Map(),
        nullColor: NEUTRAL,
        otherColor,
        chartConfig,
        itemsMap: undefined,
    });
};

describe('createSeriesColorResolver', () => {
    test('gives the "Other" pivot group its own color, not a palette color', () => {
        const completed = pivotSeries('completed');
        const other = pivotSeries(OTHER_PIVOT_KEY);
        const { getSeriesColor } = resolverFor([completed, other], OTHER);

        expect(getSeriesColor(other)).toBe(OTHER);
        expect(PALETTE).toContain(getSeriesColor(completed));
    });

    test('falls back to the null color when no "Other" color is given', () => {
        const other = pivotSeries(OTHER_PIVOT_KEY);
        const { getSeriesColor } = resolverFor([other]);

        expect(getSeriesColor(other)).toBe(NEUTRAL);
    });

    test('keeps a color picked for the "Other" group', () => {
        const other = pivotSeries(OTHER_PIVOT_KEY, '#123456');
        const { getSeriesColor } = resolverFor([other]);

        expect(getSeriesColor(other)).toBe('#123456');
    });
});
