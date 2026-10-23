import {
    CartesianSeriesType,
    DimensionType,
    FieldType,
    MetricType,
    TableCalculationType,
    TimeFrames,
    type Dimension,
    type EChartsSeries,
    type ItemsMap,
    type Metric,
    type TableCalculation,
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
    describe('x fields that are not truncated date dimensions', () => {
        const dateTableCalculation: TableCalculation = {
            name: 'orders_created_week',
            displayName: 'Week (calc)',
            sql: '${orders.created_week}',
            type: TableCalculationType.DATE,
        };
        const dateMetric = {
            fieldType: FieldType.METRIC,
            type: MetricType.MAX,
            name: 'created_week',
            label: 'Latest week',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '',
            hidden: false,
        } as Metric;
        test.each([
            ['date table calculation', dateTableCalculation],
            ['date metric', dateMetric],
        ])('%s on x leaves the chart unchanged', (_label, xItem) => {
            const series = [
                mkSeries(CartesianSeriesType.BAR),
                mkSeries(CartesianSeriesType.LINE),
            ];
            const result = applyIncompletePeriodStyle({
                series,
                rows,
                tooltip: {},
                xFieldId: 'orders_created_week',
                flipAxes: false,
                itemsMap: { orders_created_week: xItem },
                timezone: undefined,
                now,
            });
            expect(isIncompletePeriodEligible(xItem)).toBe(false);
            expect(result.series).toBe(series);
            expect(result.rows).toBe(rows);
        });
    });

    test('a date-valued y series is split like any other line', () => {
        const dateRows = rows.map((row, index) => ({
            ...row,
            orders_total: `2026-10-0${index + 1}`,
        }));
        const result = applyIncompletePeriodStyle({
            series: [mkSeries(CartesianSeriesType.LINE)],
            rows: dateRows,
            tooltip: {},
            xFieldId: 'orders_created_week',
            flipAxes: false,
            itemsMap,
            timezone: undefined,
            now,
        });
        expect(
            result.rows.map((row) => [
                row.orders_total__complete_period,
                row.orders_total__incomplete_period,
            ]),
        ).toEqual([
            ['2026-10-01', null],
            ['2026-10-02', '2026-10-02'],
            [null, '2026-10-03'],
        ]);
    });

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
        const popFieldId = 'orders_total__pop__week_1__abc123';
        const base = {
            ...mkSeries(CartesianSeriesType.BAR),
            encode: {
                ...mkSeries(CartesianSeriesType.BAR).encode!,
                yRef: { field: 'orders_total' },
            },
        };
        const previous = {
            ...base,
            encode: {
                ...base.encode,
                y: popFieldId,
                yRef: { field: popFieldId },
            },
        };
        const { series } = applyIncompletePeriodStyle({
            series: [base, previous],
            rows,
            tooltip: {},
            xFieldId: 'orders_created_week',
            flipAxes: false,
            itemsMap: {
                ...itemsMap,
                [popFieldId]: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    name: 'total__pop__week_1__abc123',
                    label: 'Total (previous week)',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '',
                    hidden: false,
                    generationType: 'periodOverPeriod',
                    baseMetricId: 'orders_total',
                    timeDimensionId: 'orders_created_week',
                    granularity: TimeFrames.WEEK,
                    periodOffset: 1,
                } as Metric,
            },
            timezone: undefined,
            now,
        });
        expect(typeof series[0].itemStyle?.color).toBe('function');
        expect(series[1]).toBe(previous);
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
