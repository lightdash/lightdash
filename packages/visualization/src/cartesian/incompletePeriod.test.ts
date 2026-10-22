import {
    CartesianSeriesType,
    DimensionType,
    FieldType,
    TimeFrames,
    type Dimension,
    type EChartsSeries,
    type ItemsMap,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    applyIncompletePeriodStyle,
    getHatchPattern,
    getIncompletePeriodRowIndexes,
    isIncompletePeriodEligible,
} from './incompletePeriod';

const now = new Date('2026-10-22T09:00:00Z');

const weekDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name: 'created_week',
    label: 'Created week',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
    timeInterval: TimeFrames.WEEK,
} as Dimension;

const itemsMap: ItemsMap = { orders_created_week: weekDimension };

const rows = [
    { orders_created_week: '2026-10-05T00:00:00Z', orders_total: 10 },
    { orders_created_week: '2026-10-12T00:00:00Z', orders_total: 12 },
    { orders_created_week: '2026-10-19T00:00:00Z', orders_total: 3 },
];

const mkSeries = (type: CartesianSeriesType): EChartsSeries => ({
    type,
    name: 'Total',
    color: '#123456',
    encode: {
        x: 'orders_created_week',
        y: 'orders_total',
        tooltip: ['orders_total'],
        seriesName: 'orders_total',
    },
    dimensions: [
        { name: 'orders_created_week', displayName: 'Created week' },
        { name: 'orders_total', displayName: 'Total' },
    ],
});

const apply = (series: EChartsSeries[]) =>
    applyIncompletePeriodStyle({
        series,
        rows,
        tooltip: {},
        xFieldId: 'orders_created_week',
        flipAxes: false,
        itemsMap,
        timezone: undefined,
        now,
    });

describe('getIncompletePeriodRowIndexes', () => {
    test('finds the period that contains now', () => {
        expect(
            getIncompletePeriodRowIndexes({
                rows,
                xKey: 'orders_created_week',
                field: weekDimension,
                timezone: undefined,
                now,
            }),
        ).toEqual(new Set([2]));
    });

    test('reads today in the results timezone for calendar grains', () => {
        // Monday 03:00 UTC is still Sunday in Los Angeles: last week is current there
        const mondayMorningUtc = new Date('2026-10-19T03:00:00Z');
        const indexes = (timezone: string | undefined) =>
            getIncompletePeriodRowIndexes({
                rows,
                xKey: 'orders_created_week',
                field: weekDimension,
                timezone,
                now: mondayMorningUtc,
            });
        expect(indexes(undefined)).toEqual(new Set([2]));
        expect(indexes('America/Los_Angeles')).toEqual(new Set([1]));
    });

    test('ignores intervals that are not truncated periods', () => {
        expect(
            getIncompletePeriodRowIndexes({
                rows,
                xKey: 'orders_created_week',
                field: { ...weekDimension, timeInterval: TimeFrames.RAW },
                timezone: undefined,
                now,
            }).size,
        ).toBe(0);
        expect(
            isIncompletePeriodEligible({
                ...weekDimension,
                timeInterval: TimeFrames.MONTH_NAME,
            } as Dimension),
        ).toBe(false);
    });
});

describe('applyIncompletePeriodStyle', () => {
    test('hatches the incomplete bar only', () => {
        const { series } = apply([mkSeries(CartesianSeriesType.BAR)]);
        const color = series[0].itemStyle?.color;
        if (typeof color !== 'function') throw new Error('expected callback');
        const params = (dataIndex: number) => ({
            dataIndex,
            name: '',
            data: {},
        });
        expect(color(params(1))).toBe('#123456');
        expect(color(params(2))).toEqual(getHatchPattern('#123456'));
    });

    test('splits a line into a solid series and a dashed overlay', () => {
        const result = apply([mkSeries(CartesianSeriesType.LINE)]);
        expect(result.series).toHaveLength(2);
        const [line, overlay] = result.series;
        expect(line.encode?.y).toBe('orders_total__complete_period');
        expect(overlay.encode?.y).toBe('orders_total__incomplete_period');
        expect(overlay.lineStyle?.type).toBe('dashed');
        expect(line.dimensions?.map((d) => d.name)).toEqual([
            'orders_created_week',
            'orders_total',
            'orders_total__complete_period',
        ]);
        expect(overlay.dimensions?.map((d) => d.name)).toEqual([
            'orders_created_week',
            'orders_total',
            'orders_total__incomplete_period',
        ]);
        // Both keep the series name the legend matches on
        expect(line.encode?.seriesName).toBe('orders_total');
        expect(overlay.encode?.seriesName).toBe('orders_total');
        expect(overlay.tooltip?.show).toBe(false);
        expect(
            result.rows.map((row) => [
                row.orders_total__complete_period,
                row.orders_total__incomplete_period,
            ]),
        ).toEqual([
            [10, null],
            [12, 12],
            [null, 3],
        ]);
    });

    test('draws the hollow end point only on lines that show points', () => {
        const endPointSize = (symbolSize: number) => {
            const [, overlay] = apply([
                { ...mkSeries(CartesianSeriesType.LINE), symbolSize },
            ]).series;
            if (typeof overlay.symbolSize !== 'function') {
                throw new Error('expected callback');
            }
            return overlay.symbolSize(undefined, { dataIndex: 2 });
        };
        expect(endPointSize(4)).toBe(7);
        expect(endPointSize(0)).toBe(0);
    });

    test('leaves previous-period comparison series alone', () => {
        const previous = {
            ...mkSeries(CartesianSeriesType.BAR),
            periodOverPeriodMetadata: {
                siblingSeriesIndex: 0,
                periodOffset: 1,
                granularity: 'WEEK',
                baseFieldId: 'orders_total',
            },
        };
        expect(apply([previous]).series).toEqual([previous]);
    });

    test('leaves stacked lines alone', () => {
        const stacked = { ...mkSeries(CartesianSeriesType.LINE), stack: 's' };
        const result = apply([stacked]);
        expect(result.series).toEqual([stacked]);
        expect(result.rows).toBe(rows);
    });

    test('restores the original column for tooltips', () => {
        const formatter = (params: unknown) => JSON.stringify(params);
        const { tooltip } = applyIncompletePeriodStyle({
            series: [mkSeries(CartesianSeriesType.LINE)],
            rows,
            tooltip: { formatter },
            xFieldId: 'orders_created_week',
            flipAxes: false,
            itemsMap,
            timezone: undefined,
            now,
        });
        expect(
            tooltip.formatter([
                {
                    dimensionNames: [
                        'orders_created_week',
                        'orders_total__complete_period',
                    ],
                },
            ]),
        ).toBe(
            JSON.stringify([
                { dimensionNames: ['orders_created_week', 'orders_total'] },
            ]),
        );
    });
});
