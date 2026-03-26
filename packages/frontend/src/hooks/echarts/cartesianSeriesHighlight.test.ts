import { FilterOperator, type Series } from '@lightdash/common';
import {
    getActiveCartesianSeriesHighlight,
    getBarSeriesHighlightColor,
    getLineSeriesHighlightColor,
    matchesSeriesHighlightValue,
} from './cartesianSeriesHighlight';

const createSeries = (overrides: Partial<Series> = {}): Series => ({
    encode: {
        xRef: { field: 'orders_status' },
        yRef: { field: 'orders_total' },
    },
    type: 'bar' as Series['type'],
    ...overrides,
});

describe('cartesianSeriesHighlight helpers', () => {
    test('finds the active highlighted series', () => {
        const series = [
            createSeries(),
            createSeries({
                encode: {
                    xRef: { field: 'orders_status' },
                    yRef: { field: 'orders_profit' },
                },
                highlight: {
                    color: '#ff0000',
                    othersColor: '#cccccc',
                },
            }),
        ];

        expect(getActiveCartesianSeriesHighlight(series)?.highlight.color).toBe(
            '#ff0000',
        );
    });

    test('ignores hidden highlighted series', () => {
        const series = [
            createSeries({
                hidden: true,
                highlight: {
                    color: '#ff0000',
                    othersColor: '#cccccc',
                },
            }),
        ];

        expect(getActiveCartesianSeriesHighlight(series)).toBeUndefined();
    });

    test('matches all values when no operator is set', () => {
        expect(
            matchesSeriesHighlightValue({
                highlight: {
                    color: '#ff0000',
                    othersColor: '#cccccc',
                },
                value: -10,
            }),
        ).toBe(true);
    });

    test('matches numeric threshold values', () => {
        expect(
            matchesSeriesHighlightValue({
                highlight: {
                    color: '#ff0000',
                    othersColor: '#cccccc',
                    operator: FilterOperator.LESS_THAN,
                    value: 0,
                },
                value: -10,
            }),
        ).toBe(true);
        expect(
            matchesSeriesHighlightValue({
                highlight: {
                    color: '#ff0000',
                    othersColor: '#cccccc',
                    operator: FilterOperator.LESS_THAN,
                    value: 0,
                },
                value: 10,
            }),
        ).toBe(false);
    });

    test('colors the highlighted line and dims others', () => {
        const highlightedSeries = createSeries({
            type: 'line' as Series['type'],
            highlight: {
                color: '#ff0000',
                othersColor: '#cccccc',
            },
        });
        const otherSeries = createSeries({
            type: 'line' as Series['type'],
            encode: {
                xRef: { field: 'orders_status' },
                yRef: { field: 'orders_profit' },
            },
        });
        const activeHighlight = getActiveCartesianSeriesHighlight([
            highlightedSeries,
            otherSeries,
        ]);

        expect(
            getLineSeriesHighlightColor({
                activeHighlight,
                series: {
                    ...highlightedSeries,
                    encode: {
                        x: 'orders_status',
                        y: 'orders_total',
                        tooltip: ['orders_total'],
                        seriesName: 'orders_total',
                        xRef: highlightedSeries.encode.xRef,
                        yRef: highlightedSeries.encode.yRef,
                    },
                },
            }),
        ).toBe('#ff0000');

        expect(
            getLineSeriesHighlightColor({
                activeHighlight,
                series: {
                    ...otherSeries,
                    encode: {
                        x: 'orders_status',
                        y: 'orders_profit',
                        tooltip: ['orders_profit'],
                        seriesName: 'orders_profit',
                        xRef: otherSeries.encode.xRef,
                        yRef: otherSeries.encode.yRef,
                    },
                },
            }),
        ).toBe('#cccccc');
    });

    test('colors highlighted bar threshold matches and dims the rest', () => {
        const highlightedSeries = createSeries({
            highlight: {
                color: '#ff0000',
                othersColor: '#cccccc',
                operator: FilterOperator.LESS_THAN,
                value: 0,
            },
        });
        const otherSeries = createSeries({
            encode: {
                xRef: { field: 'orders_status' },
                yRef: { field: 'orders_profit' },
            },
        });
        const activeHighlight = getActiveCartesianSeriesHighlight([
            highlightedSeries,
            otherSeries,
        ]);

        expect(
            getBarSeriesHighlightColor({
                activeHighlight,
                rowValues: { orders_total: -5 },
                series: {
                    ...highlightedSeries,
                    encode: {
                        x: 'orders_status',
                        y: 'orders_total',
                        tooltip: ['orders_total'],
                        seriesName: 'orders_total',
                        xRef: highlightedSeries.encode.xRef,
                        yRef: highlightedSeries.encode.yRef,
                    },
                },
            }),
        ).toBe('#ff0000');

        expect(
            getBarSeriesHighlightColor({
                activeHighlight,
                rowValues: { orders_total: 10 },
                series: {
                    ...highlightedSeries,
                    encode: {
                        x: 'orders_status',
                        y: 'orders_total',
                        tooltip: ['orders_total'],
                        seriesName: 'orders_total',
                        xRef: highlightedSeries.encode.xRef,
                        yRef: highlightedSeries.encode.yRef,
                    },
                },
            }),
        ).toBe('#cccccc');

        expect(
            getBarSeriesHighlightColor({
                activeHighlight,
                rowValues: { orders_profit: 10 },
                series: {
                    ...otherSeries,
                    encode: {
                        x: 'orders_status',
                        y: 'orders_profit',
                        tooltip: ['orders_profit'],
                        seriesName: 'orders_profit',
                        xRef: otherSeries.encode.xRef,
                        yRef: otherSeries.encode.yRef,
                    },
                },
            }),
        ).toBe('#cccccc');
    });

    test('uses the metric tooltip field for horizontal bar threshold matching', () => {
        const highlightedSeries = createSeries({
            highlight: {
                color: '#ff0000',
                othersColor: '#cccccc',
                operator: FilterOperator.GREATER_THAN,
                value: 100,
            },
        });
        const activeHighlight = getActiveCartesianSeriesHighlight([
            highlightedSeries,
        ]);

        expect(
            getBarSeriesHighlightColor({
                activeHighlight,
                rowValues: {
                    orders_status: 'completed',
                    orders_total: 250,
                },
                series: {
                    ...highlightedSeries,
                    encode: {
                        x: 'orders_total',
                        y: 'orders_status',
                        tooltip: ['orders_total'],
                        seriesName: 'orders_total',
                        xRef: highlightedSeries.encode.xRef,
                        yRef: highlightedSeries.encode.yRef,
                    },
                },
            }),
        ).toBe('#ff0000');
    });
});
