import {
    createBoundaryDateFormatter,
    DimensionType,
    FieldType,
    FilterOperator,
    renderDateFilterSql,
    renderTimestampFilterSql,
    SupportedDbtAdapter,
    TimeFrames,
    UnitOfTime,
    WeekDay,
    type Dimension,
    type FilterRule,
} from '@lightdash/common';
import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utcPlugin from 'dayjs/plugin/utc';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { getIncompletePeriodRowIndexes } from './incompletePeriod';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

// The chart must mark exactly the rows an "in the current <grain>" filter on
// the x field keeps, so these cases run the real filter compiler.

const TIMEZONES = [
    'UTC',
    'America/Los_Angeles',
    'Pacific/Pago_Pago', // UTC-11
    'Pacific/Kiritimati', // UTC+14
    'Asia/Kolkata', // UTC+5:30
    'Australia/Adelaide', // UTC+9:30/+10:30, DST
];

// Instants either side of day, week, month, quarter and year boundaries
const NOWS = [
    '2026-10-22T09:00:00Z',
    '2026-10-19T03:00:00Z', // Monday morning UTC, Sunday in the Americas
    '2026-10-18T22:30:00Z', // Sunday night UTC, Monday in Asia
    '2026-09-30T23:30:00Z', // quarter end UTC
    '2026-12-31T20:00:00Z',
    '2027-01-01T05:00:00Z',
    '2026-03-31T23:59:00Z',
    '2026-04-05T16:45:00Z', // Adelaide DST ends
];

const ADAPTERS: { adapter: SupportedDbtAdapter; weekStart: number }[] = [
    { adapter: SupportedDbtAdapter.POSTGRES, weekStart: 1 }, // Monday
    { adapter: SupportedDbtAdapter.BIGQUERY, weekStart: 0 }, // Sunday
];

const CALENDAR_GRAINS: {
    timeInterval: TimeFrames;
    unitOfTime: UnitOfTime;
}[] = [
    { timeInterval: TimeFrames.DAY, unitOfTime: UnitOfTime.days },
    { timeInterval: TimeFrames.WEEK, unitOfTime: UnitOfTime.weeks },
    { timeInterval: TimeFrames.MONTH, unitOfTime: UnitOfTime.months },
    { timeInterval: TimeFrames.QUARTER, unitOfTime: UnitOfTime.quarters },
    { timeInterval: TimeFrames.YEAR, unitOfTime: UnitOfTime.years },
];

const dimension = (type: DimensionType, timeInterval: TimeFrames) =>
    ({
        fieldType: FieldType.DIMENSION,
        type,
        name: 'x',
        label: 'x',
        table: 't',
        tableLabel: 't',
        sql: '',
        hidden: false,
        timeInterval,
    }) as Dimension;

const currentPeriodFilter = (
    unitOfTime: UnitOfTime,
): FilterRule<FilterOperator, unknown> => ({
    id: 'f',
    target: { fieldId: 't_x' },
    operator: FilterOperator.IN_THE_CURRENT,
    values: [1],
    settings: { unitOfTime },
});

// `(x) >= ('<from>') AND (x) <= ('<until>')`, literals optionally cast
const parseRange = (sql: string) => {
    const match = /\(x\) >= \(?'([^']+)'.* AND \(x\) <= \(?'([^']+)'/.exec(sql);
    if (!match) throw new Error(`Unexpected filter SQL: ${sql}`);
    return { from: match[1], until: match[2] };
};

// The warehouse's period starts, as calendar dates, around `now`
const calendarPeriodStarts = (
    timeInterval: TimeFrames,
    weekStart: number,
    now: Date,
): string[] => {
    const starts = new Set<string>();
    for (let offset = -800; offset <= 800; offset += 1) {
        const day = dayjs.utc(now).startOf('day').add(offset, 'day');
        const start = (() => {
            switch (timeInterval) {
                case TimeFrames.DAY:
                    return day;
                case TimeFrames.WEEK:
                    return day.subtract((day.day() - weekStart + 7) % 7, 'day');
                case TimeFrames.MONTH:
                    return day.startOf('month');
                case TimeFrames.QUARTER:
                    return day
                        .startOf('month')
                        .subtract(day.month() % 3, 'month');
                case TimeFrames.YEAR:
                    return day.startOf('year');
                default:
                    throw new Error(`Unexpected grain ${timeInterval}`);
            }
        })();
        starts.add(start.format('YYYY-MM-DD'));
    }
    return [...starts].sort();
};

afterEach(() => {
    vi.useRealTimers();
});

describe('incomplete period matches the "in the current" filter', () => {
    describe.each(ADAPTERS)('$adapter', ({ adapter, weekStart }) => {
        describe.each(CALENDAR_GRAINS)(
            '$timeInterval',
            ({ timeInterval, unitOfTime }) => {
                test.each(
                    NOWS.flatMap((now) =>
                        TIMEZONES.flatMap((timezone) =>
                            [true, false].map((timezoneAware) => ({
                                now,
                                timezone,
                                timezoneAware,
                            })),
                        ),
                    ),
                )(
                    'now $now in $timezone, timezone support $timezoneAware',
                    ({ now, timezone, timezoneAware }) => {
                        vi.useFakeTimers();
                        vi.setSystemTime(new Date(now));
                        const { from, until } = parseRange(
                            renderDateFilterSql({
                                dimensionSql: 'x',
                                filter: currentPeriodFilter(unitOfTime),
                                adapterType: adapter,
                                timezone,
                                boundaryDateFormatter: timezoneAware
                                    ? createBoundaryDateFormatter(timezone)
                                    : undefined,
                                startOfWeek: null,
                            }),
                        );
                        const starts = calendarPeriodStarts(
                            timeInterval,
                            weekStart,
                            new Date(now),
                        );
                        // Raw DATE values: bare dates with timezone support, UTC midnight ISO without
                        const rows = starts.map((start) => ({
                            x: timezoneAware ? start : `${start}T00:00:00.000Z`,
                        }));
                        const expected = starts.flatMap((start, index) =>
                            start >= from && start <= until ? [index] : [],
                        );
                        expect(expected).toHaveLength(1);
                        expect([
                            ...getIncompletePeriodRowIndexes({
                                rows,
                                xKey: 'x',
                                field: dimension(
                                    DimensionType.DATE,
                                    timeInterval,
                                ),
                                // The results carry a timezone only with timezone support on
                                timezone: timezoneAware ? timezone : undefined,
                                now: new Date(now),
                            }),
                        ]).toEqual(expected);
                    },
                );
            },
        );
    });

    describe.each([TimeFrames.HOUR, TimeFrames.MINUTE])(
        '%s',
        (timeInterval) => {
            const unitOfTime =
                timeInterval === TimeFrames.HOUR
                    ? UnitOfTime.hours
                    : UnitOfTime.minutes;
            const unit = timeInterval === TimeFrames.HOUR ? 'hour' : 'minute';
            // With timezone support the warehouse truncates in the query timezone
            test.each(
                NOWS.flatMap((now) =>
                    TIMEZONES.map((timezone) => ({ now, timezone })),
                ),
            )('now $now in $timezone', ({ now, timezone }) => {
                vi.useFakeTimers();
                vi.setSystemTime(new Date(now));
                const { from, until } = parseRange(
                    renderTimestampFilterSql({
                        dimensionSql: 'x',
                        filter: currentPeriodFilter(unitOfTime),
                        adapterType: SupportedDbtAdapter.POSTGRES,
                        timezone,
                        timestampFormatter: (date) =>
                            dayjs.utc(date).format('YYYY-MM-DD HH:mm:ss'),
                        startOfWeek: WeekDay.MONDAY,
                    }),
                );
                const starts = Array.from({ length: 241 }, (_, offset) =>
                    dayjs(now)
                        .tz(timezone)
                        .startOf(unit)
                        .add(offset - 120, unit)
                        .utc(),
                );
                const rows = starts.map((start) => ({
                    x: start.toISOString(),
                }));
                const fromMs = dayjs.utc(from).valueOf();
                const untilMs = dayjs.utc(until).valueOf();
                const expected = starts.flatMap((start, index) =>
                    start.valueOf() >= fromMs && start.valueOf() <= untilMs
                        ? [index]
                        : [],
                );
                expect(expected).toHaveLength(1);
                expect([
                    ...getIncompletePeriodRowIndexes({
                        rows,
                        xKey: 'x',
                        field: dimension(DimensionType.TIMESTAMP, timeInterval),
                        timezone,
                        now: new Date(now),
                    }),
                ]).toEqual(expected);
            });
        },
    );
});
