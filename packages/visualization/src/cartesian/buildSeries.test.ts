import { CartesianSeriesType } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { ordersItemsMap, ordersResults } from '../fixtures.mock';
import { buildCartesianSeries } from './config';

const build = (
    cartesianType?: Parameters<typeof buildCartesianSeries>[0]['cartesianType'],
    existingSeries?: Parameters<
        typeof buildCartesianSeries
    >[0]['existingSeries'],
) =>
    buildCartesianSeries({
        layout: { xField: 'orders_status', yField: ['orders_revenue'] },
        existingSeries,
        isStacked: false,
        pivotKeys: undefined,
        resultsData: ordersResults,
        itemsMap: ordersItemsMap,
        columnLimit: undefined,
        referenceLines: [],
        cartesianType,
    });

describe('buildCartesianSeries', () => {
    test('a chart with no series yet takes the type just picked', () => {
        const series = build({
            type: CartesianSeriesType.LINE,
            flipAxes: false,
            hasAreaStyle: true,
        });
        expect(series.length).toBeGreaterThan(0);
        series.forEach((serie) => {
            expect(serie.type).toBe(CartesianSeriesType.LINE);
            expect(serie.areaStyle).toEqual({});
        });
    });

    test('existing series keep their type over the one picked', () => {
        const [first] = build(undefined);
        const series = build(
            {
                type: CartesianSeriesType.LINE,
                flipAxes: false,
                hasAreaStyle: false,
            },
            [{ ...first, type: CartesianSeriesType.SCATTER }],
        );
        series.forEach((serie) =>
            expect(serie.type).toBe(CartesianSeriesType.SCATTER),
        );
    });

    test('bars without a type picked or series to inherit from', () => {
        build(undefined).forEach((serie) =>
            expect(serie.type).toBe(CartesianSeriesType.BAR),
        );
    });
});
