import {
    DimensionType,
    FieldType,
    TimeFrames,
    type CartesianChart,
    type ItemsMap,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    applyTimezoneShiftToEchartsOptions,
    detectCalendarTimeAxisField,
    detectTimeAxisMode,
    finalizeTimeAxisOptions,
    normalizeMarkLineTimeValues,
    resolveAxisTimezone,
    type EchartsOptionsShape,
    type MarkLineTimeNormalization,
    type TimeAxisMode,
    type TimezoneShiftedField,
} from './timezoneShift';

// Asia/Tokyo is UTC+9 year-round with no DST, so offsets are stable.
const TZ = 'Asia/Tokyo';
const TZ_OFFSET_MS = 9 * 60 * 60 * 1000;

// 2024-01-15T12:00:00Z
const UTC_MS = 1705320000000;
const SHIFTED_MS = UTC_MS + TZ_OFFSET_MS;

const makeTimeDimension = (
    name: string,
    timeInterval: TimeFrames | undefined,
    overrides?: {
        type?: DimensionType;
        skipTimezoneConversion?: boolean;
        timeIntervalBaseDimensionType?: DimensionType;
    },
): ItemsMap[string] =>
    ({
        compiledSql: '',
        tablesReferences: [],
        fieldType: FieldType.DIMENSION,
        hidden: false,
        label: name,
        name,
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        type: overrides?.type ?? DimensionType.TIMESTAMP,
        timeInterval,
        ...(overrides?.skipTimezoneConversion !== undefined
            ? { skipTimezoneConversion: overrides.skipTimezoneConversion }
            : {}),
        ...(overrides?.timeIntervalBaseDimensionType !== undefined
            ? {
                  timeIntervalBaseDimensionType:
                      overrides.timeIntervalBaseDimensionType,
              }
            : {}),
    }) as ItemsMap[string];

const makeMetric = (name: string): ItemsMap[string] =>
    ({
        compiledSql: '',
        tablesReferences: [],
        fieldType: FieldType.METRIC,
        hidden: false,
        label: name,
        name,
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        type: DimensionType.NUMBER,
    }) as ItemsMap[string];

const makeCartesian = (overrides: {
    xField?: string;
    yField?: string[];
    flipAxes?: boolean;
}): CartesianChart => ({
    layout: {
        xField: overrides.xField,
        yField: overrides.yField,
        flipAxes: overrides.flipAxes,
    },
    eChartsConfig: {},
});

describe('resolveAxisTimezone', () => {
    const itemsMap: ItemsMap = {
        orders_created_day: makeTimeDimension(
            'orders_created_day',
            TimeFrames.DAY,
        ),
        orders_created_month: makeTimeDimension(
            'orders_created_month',
            TimeFrames.MONTH,
        ),
        orders_created_no_interval: makeTimeDimension(
            'orders_created_no_interval',
            undefined,
        ),
        orders_total: makeMetric('orders_total'),
    };

    test('no shift when resolvedTimezone is undefined', () => {
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_day',
            }),
            itemsMap,
            resolvedTimezone: undefined,
        });
        expect(result).toEqual({
            timeAxisField: undefined,
            axisTimezone: undefined,
            axisDisplayTimezone: undefined,
        });
    });

    test('no shift when resolvedTimezone is UTC', () => {
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_day',
            }),
            itemsMap,
            resolvedTimezone: 'UTC',
        });
        expect(result.timeAxisField).toBeUndefined();
        expect(result.axisTimezone).toBe('UTC');
        expect(result.axisDisplayTimezone).toBeUndefined();
    });

    test('no shift when validCartesianConfig is missing', () => {
        const result = resolveAxisTimezone({
            validCartesianConfig: undefined,
            itemsMap,
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toBeUndefined();
        expect(result.axisTimezone).toBe(TZ);
    });

    test('no shift when itemsMap is missing', () => {
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_day',
            }),
            itemsMap: undefined,
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toBeUndefined();
    });

    test('no shift when the axis field is not a dimension', () => {
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({ xField: 'orders_total' }),
            itemsMap,
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toBeUndefined();
    });

    test('no shift when the dimension has no timeInterval', () => {
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_no_interval',
            }),
            itemsMap,
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toBeUndefined();
    });

    test.each([
        TimeFrames.WEEK,
        TimeFrames.MONTH,
        TimeFrames.QUARTER,
        TimeFrames.YEAR,
    ])('no shift for category-axis interval %s', (interval) => {
        const fieldId = `orders_created_${interval.toLowerCase()}`;
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({ xField: fieldId }),
            itemsMap: {
                ...itemsMap,
                [fieldId]: makeTimeDimension(fieldId, interval),
            },
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toBeUndefined();
        expect(result.axisTimezone).toBe(TZ);
    });

    test.each([TimeFrames.SECOND, TimeFrames.MINUTE, TimeFrames.HOUR])(
        'shifts sub-day buckets to wall-clock like DAY+ for interval %s (merge removes the fall-back collision)',
        (interval) => {
            const fieldId = `orders_created_${interval.toLowerCase()}`;
            const result = resolveAxisTimezone({
                validCartesianConfig: makeCartesian({ xField: fieldId }),
                itemsMap: {
                    ...itemsMap,
                    [fieldId]: makeTimeDimension(fieldId, interval),
                },
                resolvedTimezone: TZ,
            });
            expect(result.timeAxisField).toEqual({
                fieldId,
                timezone: TZ,
                flipAxes: false,
            });
            expect(result.axisTimezone).toBeUndefined();
            expect(result.axisDisplayTimezone).toBe(TZ);
        },
    );

    test('shifts day buckets to wall-clock for time-axis interval DAY', () => {
        const fieldId = 'orders_created_day';
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({ xField: fieldId }),
            itemsMap: {
                ...itemsMap,
                [fieldId]: makeTimeDimension(fieldId, TimeFrames.DAY),
            },
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toEqual({
            fieldId,
            timezone: TZ,
            flipAxes: false,
        });
        expect(result.axisTimezone).toBeUndefined();
        expect(result.axisDisplayTimezone).toBe(TZ);
    });

    test('does not shift or format a sub-day dim opted out via skipTimezoneConversion', () => {
        const fieldId = 'orders_created_hour';
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({ xField: fieldId }),
            itemsMap: {
                ...itemsMap,
                [fieldId]: makeTimeDimension(fieldId, TimeFrames.HOUR, {
                    skipTimezoneConversion: true,
                }),
            },
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toBeUndefined();
        expect(result.axisDisplayTimezone).toBeUndefined();
        expect(result.axisTimezone).toBe(TZ);
    });

    test('does not shift a DAY dim opted out via skipTimezoneConversion', () => {
        const fieldId = 'orders_created_day';
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({ xField: fieldId }),
            itemsMap: {
                ...itemsMap,
                [fieldId]: makeTimeDimension(fieldId, TimeFrames.DAY, {
                    skipTimezoneConversion: true,
                }),
            },
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toBeUndefined();
    });

    // A calendar DATE is never an instant: resolveAxisTimezone must not shift
    // it. Its ECharts coordinate is handled by detectCalendarTimeAxisField.
    test('does not shift a calendar DATE day bucket', () => {
        const fieldId = 'orders_created_day';
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({ xField: fieldId }),
            itemsMap: {
                ...itemsMap,
                [fieldId]: makeTimeDimension(fieldId, TimeFrames.DAY, {
                    type: DimensionType.DATE,
                }),
            },
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toBeUndefined();
        expect(result.axisTimezone).toBe(TZ);
    });

    test('does not shift a DATE day bucket derived from a TIMESTAMP base (GLITCH-452)', () => {
        // GLITCH-452: a day-or-coarser TIMESTAMP-base trunc now compiles to a
        // real DATE, so it is a calendar value and the time axis must not shift
        // it — same as a native DATE day bucket.
        const fieldId = 'orders_created_day';
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({ xField: fieldId }),
            itemsMap: {
                ...itemsMap,
                [fieldId]: makeTimeDimension(fieldId, TimeFrames.DAY, {
                    type: DimensionType.DATE,
                    timeIntervalBaseDimensionType: DimensionType.TIMESTAMP,
                }),
            },
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toBeUndefined();
    });

    test('selects xField when flipAxes is true', () => {
        // Flipped charts keep the time dimension in layout.xField; series
        // encoding moves it to physical Y. Selecting yField[0] would inspect
        // the metric and silently skip the shift.
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_day',
                yField: ['orders_total'],
                flipAxes: true,
            }),
            itemsMap,
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toEqual({
            fieldId: 'orders_created_day',
            timezone: TZ,
            flipAxes: true,
        });
    });

    test('returns no shift when the target field id is missing', () => {
        const result = resolveAxisTimezone({
            validCartesianConfig: makeCartesian({ xField: undefined }),
            itemsMap,
            resolvedTimezone: TZ,
        });
        expect(result.timeAxisField).toBeUndefined();
    });
});

// The reported bug: UTC project and data viewed from a positive-offset
// browser labels a calendar DATE one day early because ECharts parses the
// bare `YYYY-MM-DD` as browser-local midnight. Detection requires flag-on
// results (non-nullish resolvedTimezone), a calendar item, and the actual
// physical axis being `time`.
describe('detectCalendarTimeAxisField', () => {
    const dateDayField = 'orders_created_day';
    const itemsMap: ItemsMap = {
        [dateDayField]: makeTimeDimension(dateDayField, TimeFrames.DAY, {
            type: DimensionType.DATE,
        }),
        orders_date: makeTimeDimension('orders_date', undefined, {
            type: DimensionType.DATE,
        }),
        orders_created_month: makeTimeDimension(
            'orders_created_month',
            TimeFrames.MONTH,
            { type: DimensionType.DATE },
        ),
        orders_created_hour: makeTimeDimension(
            'orders_created_hour',
            TimeFrames.HOUR,
        ),
        orders_total: makeMetric('orders_total'),
    };

    test.each([['UTC'], [TZ]])(
        'normalizes a calendar DATE day bucket on a time axis when resolvedTimezone is %s',
        (resolvedTimezone) => {
            // The resolved timezone is only the flag-on mode signal: the
            // coordinate is always anchored to UTC midnight, never shifted.
            const result = detectCalendarTimeAxisField({
                validCartesianConfig: makeCartesian({ xField: dateDayField }),
                itemsMap,
                resolvedTimezone,
                physicalAxisType: 'time',
            });
            expect(result).toEqual({
                fieldId: dateDayField,
                timezone: 'UTC',
                flipAxes: false,
            });
        },
    );

    test('returns undefined for flag-off results (resolvedTimezone missing)', () => {
        // Flag-off raw values keep the full ISO representation, which ECharts
        // already parses at UTC — the legacy path must stay untouched.
        const result = detectCalendarTimeAxisField({
            validCartesianConfig: makeCartesian({ xField: dateDayField }),
            itemsMap,
            resolvedTimezone: undefined,
            physicalAxisType: 'time',
        });
        expect(result).toBeUndefined();
    });

    test('normalizes a plain DATE column (no timeInterval)', () => {
        const result = detectCalendarTimeAxisField({
            validCartesianConfig: makeCartesian({ xField: 'orders_date' }),
            itemsMap,
            resolvedTimezone: 'UTC',
            physicalAxisType: 'time',
        });
        expect(result).toEqual({
            fieldId: 'orders_date',
            timezone: 'UTC',
            flipAxes: false,
        });
    });

    test('normalizes a DATE day bucket derived from a TIMESTAMP base (GLITCH-452)', () => {
        const fieldId = 'orders_ts_day';
        const result = detectCalendarTimeAxisField({
            validCartesianConfig: makeCartesian({ xField: fieldId }),
            itemsMap: {
                ...itemsMap,
                [fieldId]: makeTimeDimension(fieldId, TimeFrames.DAY, {
                    type: DimensionType.DATE,
                    timeIntervalBaseDimensionType: DimensionType.TIMESTAMP,
                }),
            },
            resolvedTimezone: 'UTC',
            physicalAxisType: 'time',
        });
        expect(result).toEqual({
            fieldId,
            timezone: 'UTC',
            flipAxes: false,
        });
    });

    test('returns undefined when the physical axis is category', () => {
        // Coarse grains normally render on a category axis with string tick
        // labels; ECharts never parses those as instants.
        const result = detectCalendarTimeAxisField({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_month',
            }),
            itemsMap,
            resolvedTimezone: 'UTC',
            physicalAxisType: 'category',
        });
        expect(result).toBeUndefined();
    });

    test('normalizes a coarse calendar grain when reference lines force a time axis', () => {
        // getAxisType switches WEEK/MONTH/QUARTER/YEAR back to `time` when the
        // series carry reference lines; the built axis type is what matters.
        const result = detectCalendarTimeAxisField({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_month',
            }),
            itemsMap,
            resolvedTimezone: 'UTC',
            physicalAxisType: 'time',
        });
        expect(result).toEqual({
            fieldId: 'orders_created_month',
            timezone: 'UTC',
            flipAxes: false,
        });
    });

    test('selects xField and marks flipAxes for flipped charts', () => {
        const result = detectCalendarTimeAxisField({
            validCartesianConfig: makeCartesian({
                xField: dateDayField,
                yField: ['orders_total'],
                flipAxes: true,
            }),
            itemsMap,
            resolvedTimezone: 'UTC',
            physicalAxisType: 'time',
        });
        expect(result).toEqual({
            fieldId: dateDayField,
            timezone: 'UTC',
            flipAxes: true,
        });
    });

    test('returns undefined for a TIMESTAMP instant field', () => {
        // Instants belong to the timezone-shift path, not calendar
        // normalization.
        const result = detectCalendarTimeAxisField({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_hour',
            }),
            itemsMap,
            resolvedTimezone: TZ,
            physicalAxisType: 'time',
        });
        expect(result).toBeUndefined();
    });
});

describe('applyTimezoneShiftToEchartsOptions', () => {
    const shifted: TimezoneShiftedField = {
        fieldId: 'orders_created_day',
        timezone: TZ,
        flipAxes: false,
    };
    const shiftedDim = 'orders_created_day_ld_tz_shifted';

    test('appends a shifted column to each dataset row', () => {
        const options: EchartsOptionsShape = {
            dataset: {
                source: [
                    { orders_created_day: UTC_MS, orders_total: 10 },
                    {
                        orders_created_day: '2024-01-15T12:00:00Z',
                        orders_total: 20,
                    },
                    { orders_created_day: new Date(UTC_MS), orders_total: 30 },
                ],
            },
            series: [],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(result.dataset).toEqual({
            source: [
                {
                    orders_created_day: UTC_MS,
                    orders_total: 10,
                    [shiftedDim]: SHIFTED_MS,
                },
                {
                    orders_created_day: '2024-01-15T12:00:00Z',
                    orders_total: 20,
                    [shiftedDim]: SHIFTED_MS,
                },
                {
                    orders_created_day: new Date(UTC_MS),
                    orders_total: 30,
                    [shiftedDim]: SHIFTED_MS,
                },
            ],
        });
    });

    test('falls back to the raw value when it cannot be parsed to a number', () => {
        const options: EchartsOptionsShape = {
            dataset: {
                source: [{ orders_created_day: 'not-a-date', orders_total: 1 }],
            },
            series: [],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(result.dataset).toEqual({
            source: [
                {
                    orders_created_day: 'not-a-date',
                    orders_total: 1,
                    [shiftedDim]: 'not-a-date',
                },
            ],
        });
    });

    test('uses null when the raw value is null or undefined', () => {
        const options: EchartsOptionsShape = {
            dataset: {
                source: [
                    { orders_created_day: null, orders_total: 1 },
                    { orders_total: 2 },
                ],
            },
            series: [],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(result.dataset).toEqual({
            source: [
                {
                    orders_created_day: null,
                    orders_total: 1,
                    [shiftedDim]: null,
                },
                { orders_total: 2, [shiftedDim]: null },
            ],
        });
    });

    test('preserves dataset array shape', () => {
        const options: EchartsOptionsShape = {
            dataset: [
                { source: [{ orders_created_day: UTC_MS, orders_total: 1 }] },
                { source: [{ orders_created_day: UTC_MS, orders_total: 2 }] },
            ],
            series: [],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(Array.isArray(result.dataset)).toBe(true);
        expect(result.dataset).toHaveLength(2);
    });

    test('leaves non-object rows unchanged', () => {
        const options: EchartsOptionsShape = {
            dataset: { source: [[UTC_MS, 10]] },
            series: [],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(result.dataset).toEqual({ source: [[UTC_MS, 10]] });
    });

    test('renames x encoding and dimensions on matching series (flipAxes=false)', () => {
        const options: EchartsOptionsShape = {
            dataset: {
                source: [{ orders_created_day: UTC_MS, orders_total: 1 }],
            },
            series: [
                {
                    encode: { x: 'orders_created_day', y: 'orders_total' },
                    dimensions: [
                        'orders_created_day',
                        { name: 'orders_total' },
                    ],
                },
            ],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(result.series?.[0].encode).toEqual({
            x: shiftedDim,
            y: 'orders_total',
        });
        expect(result.series?.[0].dimensions).toEqual([
            shiftedDim,
            { name: 'orders_total' },
        ]);
    });

    test('renames y encoding when flipAxes is true', () => {
        const options: EchartsOptionsShape = {
            dataset: {
                source: [{ orders_created_day: UTC_MS, orders_total: 1 }],
            },
            series: [
                {
                    encode: { x: 'orders_total', y: 'orders_created_day' },
                    dimensions: ['orders_total', 'orders_created_day'],
                },
            ],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, {
            ...shifted,
            flipAxes: true,
        });

        expect(result.series?.[0].encode).toEqual({
            x: 'orders_total',
            y: shiftedDim,
        });
        expect(result.series?.[0].dimensions).toEqual([
            'orders_total',
            shiftedDim,
        ]);
    });

    test('leaves series whose encoding does not match the shifted field', () => {
        const options: EchartsOptionsShape = {
            dataset: { source: [] },
            series: [
                {
                    encode: { x: 'other_field', y: 'orders_total' },
                    dimensions: ['other_field', 'orders_total'],
                },
            ],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(result.series?.[0].encode).toEqual({
            x: 'other_field',
            y: 'orders_total',
        });
        expect(result.series?.[0].dimensions).toEqual([
            'other_field',
            'orders_total',
        ]);
    });

    test('shifts tuple-mode series data at the renamed dimension slot', () => {
        const options: EchartsOptionsShape = {
            dataset: { source: [] },
            series: [
                {
                    encode: { x: 'orders_created_day', y: 'orders_total' },
                    dimensions: ['orders_created_day', 'orders_total'],
                    data: [{ value: [UTC_MS, 10] }, { value: [UTC_MS, 20] }],
                },
            ],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(result.series?.[0].data).toEqual([
            { value: [SHIFTED_MS, 10] },
            { value: [SHIFTED_MS, 20] },
        ]);
    });

    test('shifts bare-array series data at axis slot 0 (flipAxes=false)', () => {
        const options: EchartsOptionsShape = {
            dataset: { source: [] },
            series: [
                {
                    // No encode/dimensions — simulates a synthetic stack-total label series.
                    data: [
                        [UTC_MS, 100],
                        [UTC_MS, 200],
                    ],
                },
            ],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(result.series?.[0].data).toEqual([
            [SHIFTED_MS, 100],
            [SHIFTED_MS, 200],
        ]);
    });

    test('shifts bare-array series data at axis slot 1 (flipAxes=true)', () => {
        const options: EchartsOptionsShape = {
            dataset: { source: [] },
            series: [
                {
                    data: [
                        [100, UTC_MS],
                        [200, UTC_MS],
                    ],
                },
            ],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, {
            ...shifted,
            flipAxes: true,
        });

        expect(result.series?.[0].data).toEqual([
            [100, SHIFTED_MS],
            [200, SHIFTED_MS],
        ]);
    });

    test('leaves bare-array series data unchanged when the axis slot is not a date', () => {
        const data = [
            ['category-a', 100],
            ['category-b', 200],
        ];
        const options: EchartsOptionsShape = {
            dataset: { source: [] },
            series: [{ data }],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(result.series?.[0].data).toBe(data);
    });

    test('preserves unrelated options keys', () => {
        const options = {
            dataset: { source: [{ orders_created_day: UTC_MS }] },
            series: [],
            xAxis: { type: 'time' as const },
            yAxis: { type: 'value' as const },
        };

        const result = applyTimezoneShiftToEchartsOptions(options, shifted);

        expect(result.xAxis).toEqual({ type: 'time' });
        expect(result.yAxis).toEqual({ type: 'value' });
    });
});

// Calendar DATE axes reuse the shift machinery with timezone 'UTC': a bare
// `YYYY-MM-DD` becomes the UTC-midnight epoch, so ECharts (useUTC: true) parses
// and labels it on the correct day for every browser offset. This is the fix
// for the day-early axis/tooltip bug on positive-offset browsers.
describe('applyTimezoneShiftToEchartsOptions calendar DATE anchoring (timezone UTC)', () => {
    const calendarDay: TimezoneShiftedField = {
        fieldId: 'orders_created_day',
        timezone: 'UTC',
        flipAxes: false,
    };
    const shiftedDim = 'orders_created_day_ld_tz_shifted';

    test('anchors a date-only string to its UTC-midnight epoch (no offset)', () => {
        const options: EchartsOptionsShape = {
            dataset: {
                source: [{ orders_created_day: '2024-07-22', orders_total: 5 }],
            },
            series: [],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, calendarDay);

        const source = (result.dataset as { source: Record<string, unknown>[] })
            .source;
        expect(source[0][shiftedDim]).toBe(Date.parse('2024-07-22T00:00:00Z'));
        // Original column is preserved for timezone-agnostic DATE formatting.
        expect(source[0].orders_created_day).toBe('2024-07-22');
    });
});

// Reference-line values are user-authored strings; normalizeMarkLineTimeValues
// defines the stored-value → position rule. Explicit-zone strings, numbers,
// and Dates are instants (shifted like the data points); offset-less strings
// in the strict grain formats are wall-clock positions plotted directly with
// no offset (browser-independent); everything else is untouched.
describe('normalizeMarkLineTimeValues', () => {
    const identity: MarkLineTimeNormalization = {
        flipAxes: false,
        instantTimezone: undefined,
    };
    const shiftedTokyo: MarkLineTimeNormalization = {
        flipAxes: false,
        instantTimezone: TZ,
    };

    const makeMarkLineSeries = (
        data: Record<string, unknown>[],
    ): EchartsOptionsShape => ({
        dataset: { source: [] },
        series: [{ markLine: { symbol: 'none', data } }],
    });

    const getMarkLineData = (result: EchartsOptionsShape) =>
        (
            result.series?.[0].markLine as {
                data: Record<string, unknown>[];
            }
        ).data;

    test('plots a date-only value at the visible day boundary on a shifted axis', () => {
        const options = makeMarkLineSeries([
            { uuid: 'a', xAxis: '2024-01-15', name: 'Jan 15' },
        ]);

        const result = normalizeMarkLineTimeValues(options, shiftedTokyo);

        // Wall-clock position: NOT offset by the +9h display shift.
        expect(getMarkLineData(result)).toEqual([
            {
                uuid: 'a',
                xAxis: Date.parse('2024-01-15T00:00:00Z'),
                name: 'Jan 15',
                label: { formatter: 'Jan 15' },
            },
        ]);
    });

    test('preserves the author text as the default label when numericizing', () => {
        const options = makeMarkLineSeries([
            // no formatter → gains one so the label is not the epoch number
            {
                uuid: 'a',
                xAxis: '2024-01-16 06:00',
                label: { position: 'end' },
            },
            // an existing formatter always wins
            {
                uuid: 'b',
                xAxis: '2024-01-15',
                label: { position: 'end', formatter: 'Launch' },
            },
            // numbers were always numeric; no label is invented for them
            { uuid: 'c', xAxis: UTC_MS },
        ]);

        const result = normalizeMarkLineTimeValues(options, identity);

        // Unnamed entries are named after the author text: the shared
        // reference-line style formatter renders `name || value`.
        expect(getMarkLineData(result)[0].name).toBe('2024-01-16 06:00');
        expect(getMarkLineData(result)[0].label).toEqual({
            position: 'end',
            formatter: '2024-01-16 06:00',
        });
        expect(getMarkLineData(result)[1].label).toEqual({
            position: 'end',
            formatter: 'Launch',
        });
        expect(getMarkLineData(result)[2].name).toBeUndefined();
        expect(getMarkLineData(result)[2].label).toBeUndefined();
    });

    test('plots an offset-less datetime at its wall-clock position, browser-independent', () => {
        const options = makeMarkLineSeries([
            { uuid: 'a', xAxis: '2024-01-15 12:00' },
            { uuid: 'b', xAxis: '2024-01-15T12:00:00' },
        ]);

        const result = normalizeMarkLineTimeValues(options, shiftedTokyo);

        expect(getMarkLineData(result)[0].xAxis).toBe(UTC_MS);
        expect(getMarkLineData(result)[1].xAxis).toBe(UTC_MS);
    });

    test('shifts explicit-zone instants by the axis wall-clock offset', () => {
        const options = makeMarkLineSeries([
            { uuid: 'a', xAxis: '2024-01-15T12:00:00Z' },
            { uuid: 'b', xAxis: '2024-01-15 21:00:00+09:00' },
        ]);

        const result = normalizeMarkLineTimeValues(options, shiftedTokyo);

        expect(getMarkLineData(result)[0].xAxis).toBe(SHIFTED_MS);
        // 21:00+09:00 is the same instant as 12:00Z.
        expect(getMarkLineData(result)[1].xAxis).toBe(SHIFTED_MS);
    });

    test('keeps instants at their raw epoch on unshifted axes', () => {
        const options = makeMarkLineSeries([
            { uuid: 'a', xAxis: '2024-01-15T12:00:00Z' },
            { uuid: 'b', xAxis: UTC_MS },
        ]);

        const result = normalizeMarkLineTimeValues(options, identity);

        expect(getMarkLineData(result)[0].xAxis).toBe(UTC_MS);
        expect(getMarkLineData(result)[1].xAxis).toBe(UTC_MS);
    });

    test('shifts numeric epoch values like instants on shifted axes', () => {
        const options = makeMarkLineSeries([{ uuid: 'a', xAxis: UTC_MS }]);

        const result = normalizeMarkLineTimeValues(options, shiftedTokyo);

        expect(getMarkLineData(result)[0].xAxis).toBe(SHIFTED_MS);
    });

    test('parses month, year, and quarter grain values to their period start', () => {
        const options = makeMarkLineSeries([
            { uuid: 'a', xAxis: '2024-07' },
            { uuid: 'b', xAxis: '2024' },
            { uuid: 'c', xAxis: '2024-Q3' },
        ]);

        const result = normalizeMarkLineTimeValues(options, identity);

        expect(getMarkLineData(result)[0].xAxis).toBe(
            Date.parse('2024-07-01T00:00:00Z'),
        );
        expect(getMarkLineData(result)[1].xAxis).toBe(
            Date.parse('2024-01-01T00:00:00Z'),
        );
        expect(getMarkLineData(result)[2].xAxis).toBe(
            Date.parse('2024-07-01T00:00:00Z'),
        );
    });

    test('places a wall-clock value inside a DST spring-forward gap deterministically', () => {
        // 02:30 on 2024-03-10 does not exist in America/New_York; as a naive
        // wall-clock position it still lands between the 02:00 and 03:00
        // slots of the merged wall-clock axis.
        const options = makeMarkLineSeries([
            { uuid: 'a', xAxis: '2024-03-10 02:30' },
        ]);

        const result = normalizeMarkLineTimeValues(options, {
            flipAxes: false,
            instantTimezone: 'America/New_York',
        });

        expect(getMarkLineData(result)[0].xAxis).toBe(
            Date.parse('2024-03-10T02:30:00Z'),
        );
    });

    test('leaves non-time strings untouched', () => {
        const data = [
            { uuid: 'a', xAxis: '42' },
            { uuid: 'b', xAxis: '50.5' },
            { uuid: 'c', xAxis: '' },
            { uuid: 'd', xAxis: 'garbage' },
            { uuid: 'e', xAxis: '2024-13' },
        ];
        const options = makeMarkLineSeries(data);

        const result = normalizeMarkLineTimeValues(options, shiftedTokyo);

        expect(getMarkLineData(result)).toEqual(data);
    });

    test('skips series-relative marks even when they carry stale slot values', () => {
        const data = [
            { uuid: 'a', type: 'average' },
            { uuid: 'b', type: 'average', xAxis: '2024-01-15' },
        ];
        const options = makeMarkLineSeries(data);

        const result = normalizeMarkLineTimeValues(options, shiftedTokyo);

        expect(getMarkLineData(result)).toEqual(data);
    });

    test('targets the yAxis slot when flipped', () => {
        const options = makeMarkLineSeries([
            { uuid: 'a', yAxis: '2024-07-22' },
        ]);

        const result = normalizeMarkLineTimeValues(options, {
            ...identity,
            flipAxes: true,
        });

        expect(getMarkLineData(result)).toEqual([
            {
                uuid: 'a',
                yAxis: Date.parse('2024-07-22T00:00:00Z'),
                name: '2024-07-22',
                label: { formatter: '2024-07-22' },
            },
        ]);
    });

    test('rescues a date value stranded in the value-axis slot and clears the source', () => {
        // Semantic keying stores the date under xAxis even when flipped; the
        // date lives on physical Y, so ECharts drops the line entirely today.
        const flipped = normalizeMarkLineTimeValues(
            makeMarkLineSeries([{ uuid: 'a', xAxis: '2020-07-05' }]),
            { ...identity, flipAxes: true },
        );
        expect(getMarkLineData(flipped)).toEqual([
            {
                uuid: 'a',
                yAxis: Date.parse('2020-07-05T00:00:00Z'),
                xAxis: undefined,
                name: '2020-07-05',
                label: { formatter: '2020-07-05' },
            },
        ]);

        // Orientation-generic: flip→save→unflip can strand a date in yAxis.
        const vertical = normalizeMarkLineTimeValues(
            makeMarkLineSeries([{ uuid: 'b', yAxis: '2020-07-05' }]),
            identity,
        );
        expect(getMarkLineData(vertical)).toEqual([
            {
                uuid: 'b',
                xAxis: Date.parse('2020-07-05T00:00:00Z'),
                yAxis: undefined,
                name: '2020-07-05',
                label: { formatter: '2020-07-05' },
            },
        ]);
    });

    test('never rescues numeric strings from the value axis', () => {
        const data = [
            { uuid: 'a', yAxis: '50' },
            { uuid: 'b', yAxis: '2024', name: 'Revenue target' },
        ];
        const options = makeMarkLineSeries(data);

        const result = normalizeMarkLineTimeValues(options, identity);

        expect(getMarkLineData(result)).toEqual(data);
    });

    test('never rescues a numeric year string when flipped', () => {
        const data = [{ uuid: 'a', xAxis: '2024', name: 'Revenue target' }];
        const options = makeMarkLineSeries(data);

        const result = normalizeMarkLineTimeValues(options, {
            ...identity,
            flipAxes: true,
        });

        expect(getMarkLineData(result)).toEqual(data);
    });

    test('never rescues a line from another physical time axis', () => {
        const data = [{ uuid: 'a', yAxis: '2024-02-01' }];
        const options = makeMarkLineSeries(data);

        const result = normalizeMarkLineTimeValues(options, {
            ...identity,
            canRescueFromOppositeAxis: false,
        });

        expect(getMarkLineData(result)).toEqual(data);
    });

    test('does not rescue when the time slot is occupied', () => {
        const options = makeMarkLineSeries([
            { uuid: 'a', xAxis: '2024-01-15', yAxis: '2024-02-01' },
        ]);

        const result = normalizeMarkLineTimeValues(options, identity);

        expect(getMarkLineData(result)).toEqual([
            {
                uuid: 'a',
                xAxis: Date.parse('2024-01-15T00:00:00Z'),
                yAxis: '2024-02-01',
                name: '2024-01-15',
                label: { formatter: '2024-01-15' },
            },
        ]);
    });

    test('leaves options without series and series without markLine untouched', () => {
        const noSeries: EchartsOptionsShape = { dataset: { source: [] } };
        expect(normalizeMarkLineTimeValues(noSeries, identity)).toBe(noSeries);

        const noMarkLine: EchartsOptionsShape = {
            dataset: { source: [] },
            series: [{ data: [] }],
        };
        expect(
            normalizeMarkLineTimeValues(noMarkLine, identity).series?.[0],
        ).toEqual({ data: [] });
    });
});

// The dataset/encode walker no longer touches markLine values — that is
// normalizeMarkLineTimeValues' job, run for every flag-on time axis.
describe('applyTimezoneShiftToEchartsOptions markLine values', () => {
    test('passes markLine data through unchanged', () => {
        const data = [{ uuid: 'a', xAxis: '2024-07-22' }];
        const options: EchartsOptionsShape = {
            dataset: { source: [] },
            series: [{ markLine: { symbol: 'none', data } }],
        };

        const result = applyTimezoneShiftToEchartsOptions(options, {
            fieldId: 'orders_created_day',
            timezone: TZ,
            flipAxes: false,
        });

        expect((result.series?.[0].markLine as { data: unknown }).data).toEqual(
            data,
        );
    });
});

// Sub-day grains now ride the same shift path as DAY+. These confirm the shift
// handles the per-instant DST offset so the wall-clock axis renders the merge
// route correctly: the fall-back collapses to one position, spring-forward
// leaves the skipped hour empty. America/New_York is -04:00 (EDT) / -05:00 (EST).
describe('applyTimezoneShiftToEchartsOptions across DST (sub-day, America/New_York)', () => {
    const nyHour: TimezoneShiftedField = {
        fieldId: 'orders_created_hour',
        timezone: 'America/New_York',
        flipAxes: false,
    };
    const dim = 'orders_created_hour_ld_tz_shifted';
    const shiftedColumn = (
        sourceRows: Record<string, unknown>[],
    ): unknown[] => {
        const result = applyTimezoneShiftToEchartsOptions(
            { dataset: { source: sourceRows }, series: [] },
            nyHour,
        );
        const source = (result.dataset as { source: Record<string, unknown>[] })
            .source;
        return source.map((row) => row[dim]);
    };

    test('fall-back: both folded 01:30 instants shift to the same wall-clock position', () => {
        // 05:30Z is 01:30 EDT, 06:30Z is 01:30 EST — one real hour apart, same
        // wall-clock. Under merge there is only one bucket; either folded instant
        // shifts to the single 01:30 position (no split collision).
        expect(
            shiftedColumn([
                { orders_created_hour: '2024-11-03T05:30:00Z' },
                { orders_created_hour: '2024-11-03T06:30:00Z' },
            ]),
        ).toEqual([
            Date.parse('2024-11-03T01:30:00Z'),
            Date.parse('2024-11-03T01:30:00Z'),
        ]);
    });

    test('spring-forward: instants shift to 01:30 and 03:30, leaving the skipped 02:00 hour empty', () => {
        // 06:30Z is 01:30 EST; 07:30Z is 03:30 EDT. The 02:00–03:00 wall-clock
        // hour never happened, so no bucket lands there.
        const shifted = shiftedColumn([
            { orders_created_hour: '2024-03-10T06:30:00Z' },
            { orders_created_hour: '2024-03-10T07:30:00Z' },
        ]);
        expect(shifted).toEqual([
            Date.parse('2024-03-10T01:30:00Z'),
            Date.parse('2024-03-10T03:30:00Z'),
        ]);
        expect(shifted).not.toContain(Date.parse('2024-03-10T02:30:00Z'));
    });
});

describe('detectTimeAxisMode', () => {
    const itemsMap: ItemsMap = {
        orders_created_hour: makeTimeDimension(
            'orders_created_hour',
            TimeFrames.HOUR,
        ),
        orders_date: makeTimeDimension('orders_date', undefined, {
            type: DimensionType.DATE,
        }),
        orders_total: makeMetric('orders_total'),
    };

    test('returns undefined when timezone support is off (no resolvedTimezone)', () => {
        const result = detectTimeAxisMode({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_hour',
            }),
            itemsMap,
            resolvedTimezone: undefined,
            physicalAxisType: 'time',
        });
        expect(result).toBeUndefined();
    });

    test.each([['category'], ['value'], [undefined]])(
        'returns undefined when the physical axis type is %s',
        (physicalAxisType) => {
            const result = detectTimeAxisMode({
                validCartesianConfig: makeCartesian({
                    xField: 'orders_created_hour',
                }),
                itemsMap,
                resolvedTimezone: TZ,
                physicalAxisType,
            });
            expect(result).toBeUndefined();
        },
    );

    test('detects a shiftable instant dim as instant-shifted', () => {
        const result = detectTimeAxisMode({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_hour',
            }),
            itemsMap,
            resolvedTimezone: TZ,
            physicalAxisType: 'time',
        });
        expect(result).toEqual({
            kind: 'instant-shifted',
            fieldId: 'orders_created_hour',
            timezone: TZ,
            flipAxes: false,
        });
    });

    test('detects a calendar DATE as calendar even on a shifted project', () => {
        const result = detectTimeAxisMode({
            validCartesianConfig: makeCartesian({ xField: 'orders_date' }),
            itemsMap,
            resolvedTimezone: TZ,
            physicalAxisType: 'time',
        });
        expect(result).toEqual({
            kind: 'calendar',
            fieldId: 'orders_date',
            flipAxes: false,
        });
    });

    test('falls back to plain for a UTC project so ref lines still normalize', () => {
        const result = detectTimeAxisMode({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_hour',
            }),
            itemsMap,
            resolvedTimezone: 'UTC',
            physicalAxisType: 'time',
        });
        expect(result).toEqual({ kind: 'plain', flipAxes: false });
    });

    test('plain carries the timezone used to format its raw coordinates', () => {
        const result = detectTimeAxisMode({
            validCartesianConfig: makeCartesian({ xField: 'orders_total' }),
            itemsMap,
            resolvedTimezone: TZ,
            physicalAxisType: 'time',
            plainWallClockTimezone: TZ,
        });

        expect(result).toEqual({
            kind: 'plain',
            flipAxes: false,
            wallClockTimezone: TZ,
        });
    });

    test('propagates flipAxes on every mode', () => {
        const result = detectTimeAxisMode({
            validCartesianConfig: makeCartesian({
                xField: 'orders_created_hour',
                yField: ['orders_total'],
                flipAxes: true,
            }),
            itemsMap,
            resolvedTimezone: TZ,
            physicalAxisType: 'time',
        });
        expect(result).toMatchObject({
            kind: 'instant-shifted',
            flipAxes: true,
        });
    });
});

describe('finalizeTimeAxisOptions', () => {
    const shiftedDim = 'orders_created_hour_ld_tz_shifted';
    const makeOptions = (markLineValue: unknown): EchartsOptionsShape => ({
        dataset: {
            source: [
                {
                    orders_created_hour: '2024-01-15T12:00:00Z',
                    orders_total: 10,
                },
            ],
        },
        series: [
            {
                encode: { x: 'orders_created_hour', y: 'orders_total' },
                markLine: { data: [{ xAxis: markLineValue }] },
            },
        ],
    });

    const getSourceRow = (result: EchartsOptionsShape) =>
        (result.dataset as { source: Record<string, unknown>[] }).source[0];

    const getMarkLineValue = (result: EchartsOptionsShape) =>
        (result.series?.[0].markLine as { data: Record<string, unknown>[] })
            .data[0].xAxis;

    test('no mode: options pass through untouched (flag off / no time axis)', () => {
        const options = makeOptions('2024-01-15');
        expect(finalizeTimeAxisOptions(options, undefined)).toBe(options);
    });

    test('instant-shifted: rewrites coordinates and gives ref-line instants the same shift', () => {
        const result = finalizeTimeAxisOptions(
            makeOptions('2024-01-15T12:00:00Z'),
            {
                kind: 'instant-shifted',
                fieldId: 'orders_created_hour',
                timezone: TZ,
                flipAxes: false,
            },
        );
        expect(getSourceRow(result)[shiftedDim]).toBe(SHIFTED_MS);
        expect(result.series?.[0].encode?.x).toBe(shiftedDim);
        expect(getMarkLineValue(result)).toBe(SHIFTED_MS);
    });

    test('instant-shifted: plots a date-only ref line at the visible day boundary', () => {
        const result = finalizeTimeAxisOptions(makeOptions('2024-01-15'), {
            kind: 'instant-shifted',
            fieldId: 'orders_created_hour',
            timezone: TZ,
            flipAxes: false,
        });
        expect(getMarkLineValue(result)).toBe(
            Date.parse('2024-01-15T00:00:00Z'),
        );
    });

    test('calendar: anchors coordinates and ref lines to UTC midnight without shifting', () => {
        const options: EchartsOptionsShape = {
            dataset: { source: [{ orders_date: '2024-07-22' }] },
            series: [
                {
                    encode: { x: 'orders_date', y: 'orders_total' },
                    markLine: { data: [{ xAxis: '2024-07-22' }] },
                },
            ],
        };
        const result = finalizeTimeAxisOptions(options, {
            kind: 'calendar',
            fieldId: 'orders_date',
            flipAxes: false,
        });
        const anchoredMs = Date.parse('2024-07-22T00:00:00Z');
        expect(getSourceRow(result).orders_date_ld_tz_shifted).toBe(anchoredMs);
        expect(getMarkLineValue(result)).toBe(anchoredMs);
    });

    test('plain: leaves coordinates untouched but still normalizes ref lines', () => {
        const options = makeOptions('2024-01-15T12:00:00Z');
        const result = finalizeTimeAxisOptions(options, {
            kind: 'plain',
            flipAxes: false,
        });
        expect(result.dataset).toBe(options.dataset);
        expect(result.series?.[0].encode?.x).toBe('orders_created_hour');
        // Instants keep their raw epoch on an unshifted axis.
        expect(getMarkLineValue(result)).toBe(UTC_MS);
    });

    test('plain: maps offset-less values onto a timezone-formatted raw axis', () => {
        const mode: TimeAxisMode = {
            kind: 'plain',
            flipAxes: false,
            wallClockTimezone: TZ,
        };

        const wallClock = finalizeTimeAxisOptions(
            makeOptions('2024-01-15 12:00'),
            mode,
        );
        const explicitInstant = finalizeTimeAxisOptions(
            makeOptions('2024-01-15T12:00:00Z'),
            mode,
        );

        // 12:00 as displayed in Tokyo is the raw 03:00Z coordinate. Explicit
        // instants remain raw because this axis is not coordinate-shifted.
        expect(getMarkLineValue(wallClock)).toBe(
            Date.parse('2024-01-15T03:00:00Z'),
        );
        expect(getMarkLineValue(explicitInstant)).toBe(UTC_MS);
    });

    test('does not rescue from a second physical time axis', () => {
        const data = [{ yAxis: '2024-02-01' }];
        const options: EchartsOptionsShape = {
            dataset: { source: [] },
            series: [{ markLine: { data } }],
        };

        const result = finalizeTimeAxisOptions(
            options,
            { kind: 'plain', flipAxes: false },
            { canRescueFromOppositeAxis: false },
        );

        expect(
            (result.series?.[0].markLine as { data: unknown[] }).data,
        ).toEqual(data);
    });
});
