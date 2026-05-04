import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType } from '../types/field';
import { DateGranularity, TimeFrames } from '../types/timeFrames';
import {
    dateTruncTimezoneConversions,
    getDateDimension,
    getSqlForTruncatedDate,
    isSubDayGranularity,
    SUB_DAY_GRANULARITIES,
    timeFrameConfigs,
    WeekDay,
} from './timeFrames';

describe('TimeFrames', () => {
    describe('getSqlForTruncatedDate', () => {
        test('should get sql where stat of the week is Wednesday', async () => {
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(
                "(DATE_TRUNC('WEEK', (${TABLE}.created - interval '2 days')) + interval '2 days')",
            );
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.REDSHIFT,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(
                "(DATE_TRUNC('WEEK', (${TABLE}.created - interval '2 days')) + interval '2 days')",
            );
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.DUCKDB,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(
                "(DATE_TRUNC('WEEK', (${TABLE}.created - interval '2 days')) + interval '2 days')",
            );
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual('TIMESTAMP_TRUNC(${TABLE}.created, WEEK(WEDNESDAY))');
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.DATABRICKS,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(
                "DATEADD(DAY, 2, DATE_TRUNC('WEEK', DATEADD(DAY, -2, ${TABLE}.created)))",
            );
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.SNOWFLAKE,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(
                "DATE_TRUNC('WEEK', ${TABLE}.created)", // start of week is set in the session
            );
            // ClickHouse: toStartOfWeek(date, 1) uses mode 1 (Monday base), matching Postgres DATE_TRUNC('week')
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(
                'addDays(toStartOfWeek(addDays(${TABLE}.created, -2), 1), 2)',
            );
        });

        test('should get sql where start of the week is Monday for ClickHouse', () => {
            // Monday (startOfWeek=0): must pass mode 1 to toStartOfWeek() so it returns Monday not Sunday
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.MONDAY,
                ),
            ).toEqual(
                'addDays(toStartOfWeek(addDays(${TABLE}.created, -0), 1), 0)',
            );
        });

        test('ClickHouse SECOND truncation lifts to DateTime64 (toStartOfSecond rejects plain DateTime)', () => {
            expect(
                timeFrameConfigs[TimeFrames.SECOND].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    TimeFrames.SECOND,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                ),
            ).toEqual('toStartOfSecond(toDateTime64(${TABLE}.created, 3))');
        });

        test('ClickHouse MILLISECOND truncation lifts to DateTime64 (toStartOfMillisecond rejects plain DateTime)', () => {
            expect(
                timeFrameConfigs[TimeFrames.MILLISECOND].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    TimeFrames.MILLISECOND,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                ),
            ).toEqual(
                'toStartOfMillisecond(toDateTime64(${TABLE}.created, 3))',
            );
        });
    });

    describe('getSqlForDatePart - DAY_OF_WEEK_INDEX with startOfWeek', () => {
        const col = '${TABLE}.created';
        const tf = TimeFrames.DAY_OF_WEEK_INDEX;
        const dt = DimensionType.DATE;

        test('should adjust day of week index for Monday start', () => {
            // BigQuery: native DAYOFWEEK 1=Sun..7=Sat, offset for Monday = 2
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.BIGQUERY,
                    tf,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(`MOD(EXTRACT(DAYOFWEEK FROM ${col}) - 2 + 7, 7) + 1`);

            // PostgreSQL: native DOW 0=Sun..6=Sat, offset for Monday = 1
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.POSTGRES,
                    tf,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(
                `MOD(CAST(DATE_PART('DOW', ${col}) AS INT) - 1 + 7, 7) + 1`,
            );

            // Redshift uses same config as PostgreSQL
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.REDSHIFT,
                    tf,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(
                `MOD(CAST(DATE_PART('DOW', ${col}) AS INT) - 1 + 7, 7) + 1`,
            );

            // Databricks: native DOW 0=Sun..6=Sat, offset for Monday = 1
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.DATABRICKS,
                    tf,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(
                `MOD(CAST(DATE_PART('DOW', ${col}) AS INT) - 1 + 7, 7) + 1`,
            );

            // Trino: native DOW (ISO) 1=Mon..7=Sun, offset for Monday = 1
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.TRINO,
                    tf,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(`MOD(EXTRACT(DOW FROM ${col}) - 1 + 7, 7) + 1`);

            // Athena uses Trino config
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.ATHENA,
                    tf,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(`MOD(EXTRACT(DOW FROM ${col}) - 1 + 7, 7) + 1`);

            // ClickHouse: native toDayOfWeek (ISO) 1=Mon..7=Sun, offset for Monday = 1
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    tf,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(`modulo(toDayOfWeek(${col}) - 1 + 7, 7) + 1`);
        });

        test('should adjust day of week index for Sunday start', () => {
            // BigQuery: offset for Sunday = (6+1)%7+1 = 0+1 = 1
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.BIGQUERY,
                    tf,
                    col,
                    dt,
                    WeekDay.SUNDAY,
                ),
            ).toEqual(`MOD(EXTRACT(DAYOFWEEK FROM ${col}) - 1 + 7, 7) + 1`);

            // PostgreSQL: offset for Sunday = (6+1)%7 = 0
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.POSTGRES,
                    tf,
                    col,
                    dt,
                    WeekDay.SUNDAY,
                ),
            ).toEqual(
                `MOD(CAST(DATE_PART('DOW', ${col}) AS INT) - 0 + 7, 7) + 1`,
            );

            // Trino: offset for Sunday = 6+1 = 7
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.TRINO,
                    tf,
                    col,
                    dt,
                    WeekDay.SUNDAY,
                ),
            ).toEqual(`MOD(EXTRACT(DOW FROM ${col}) - 7 + 7, 7) + 1`);

            // ClickHouse: offset for Sunday = 6+1 = 7
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    tf,
                    col,
                    dt,
                    WeekDay.SUNDAY,
                ),
            ).toEqual(`modulo(toDayOfWeek(${col}) - 7 + 7, 7) + 1`);
        });

        test('should not adjust day of week index when startOfWeek is not set', () => {
            // Without startOfWeek, native behavior is preserved
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.BIGQUERY,
                    tf,
                    col,
                    dt,
                ),
            ).toEqual(`EXTRACT(DAYOFWEEK FROM ${col})`);

            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.POSTGRES,
                    tf,
                    col,
                    dt,
                ),
            ).toEqual(`DATE_PART('DOW', ${col})`);
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.DUCKDB,
                    tf,
                    col,
                    dt,
                ),
            ).toEqual(`DATE_PART('DOW', ${col})`);

            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.TRINO,
                    tf,
                    col,
                    dt,
                ),
            ).toEqual(`EXTRACT(DOW FROM ${col})`);

            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    tf,
                    col,
                    dt,
                ),
            ).toEqual(`toDayOfWeek(${col})`);

            // Snowflake: always uses session variable, never adjusts
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.SNOWFLAKE,
                    tf,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(`DATE_PART('DOW', ${col})`);
        });
    });

    describe('getSqlForDatePart - ClickHouse WEEK_NUM with startOfWeek', () => {
        const col = '${TABLE}.created';
        const tf = TimeFrames.WEEK_NUM;
        const dt = DimensionType.DATE;

        test('Monday start: toWeek mode 3 (ISO) matches Postgres EXTRACT(WEEK), fixes US-default off-by-one', () => {
            // toWeek(d) defaults to mode 0 (US, Sunday-base, 0–53). Mode 3 is
            // ISO 8601 (Monday-base), matching every other warehouse adapter.
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    tf,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(`toWeek(addDays(${col}, -0), 3)`);
        });

        test('Wednesday start: shift date back by 2 days before extracting ISO week', () => {
            expect(
                timeFrameConfigs[tf].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    tf,
                    col,
                    dt,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(`toWeek(addDays(${col}, -2), 3)`);
        });
    });

    describe('getSqlForDatePartName - ClickHouse', () => {
        const col = '${TABLE}.created';
        const dt = DimensionType.DATE;

        test('DAY_OF_WEEK_NAME uses dateName(weekday, ...) — toDayOfWeekName does not exist in ClickHouse', () => {
            expect(
                timeFrameConfigs[TimeFrames.DAY_OF_WEEK_NAME].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    TimeFrames.DAY_OF_WEEK_NAME,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(`dateName('weekday', ${col})`);
        });

        test('MONTH_NAME uses monthName(...) — toMonthName does not exist in ClickHouse', () => {
            expect(
                timeFrameConfigs[TimeFrames.MONTH_NAME].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    TimeFrames.MONTH_NAME,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(`monthName(${col})`);
        });

        test('QUARTER_NAME stays as concat(Q, toQuarter(...))', () => {
            expect(
                timeFrameConfigs[TimeFrames.QUARTER_NAME].getSql(
                    SupportedDbtAdapter.CLICKHOUSE,
                    TimeFrames.QUARTER_NAME,
                    col,
                    dt,
                    WeekDay.MONDAY,
                ),
            ).toEqual(`concat('Q', toString(toQuarter(${col})))`);
        });
    });

    describe('isSubDayGranularity', () => {
        test('SUB_DAY_GRANULARITIES matches timeFrameConfigs that produce TIMESTAMP', () => {
            // Map from DateGranularity to TimeFrames for the sub-day ones
            const subDayTimeFrames: Record<string, TimeFrames> = {
                [DateGranularity.SECOND]: TimeFrames.SECOND,
                [DateGranularity.MINUTE]: TimeFrames.MINUTE,
                [DateGranularity.HOUR]: TimeFrames.HOUR,
            };
            for (const g of SUB_DAY_GRANULARITIES) {
                const tf = subDayTimeFrames[g];
                const dimType = timeFrameConfigs[tf].getDimensionType(
                    DimensionType.DATE,
                );
                expect(dimType).toBe(DimensionType.TIMESTAMP);
            }
        });

        test('standard granularities not in SUB_DAY produce DATE', () => {
            const dayAndAbove: Array<{
                granularity: DateGranularity;
                timeFrame: TimeFrames;
            }> = [
                {
                    granularity: DateGranularity.DAY,
                    timeFrame: TimeFrames.DAY,
                },
                {
                    granularity: DateGranularity.WEEK,
                    timeFrame: TimeFrames.WEEK,
                },
                {
                    granularity: DateGranularity.MONTH,
                    timeFrame: TimeFrames.MONTH,
                },
                {
                    granularity: DateGranularity.QUARTER,
                    timeFrame: TimeFrames.QUARTER,
                },
                {
                    granularity: DateGranularity.YEAR,
                    timeFrame: TimeFrames.YEAR,
                },
            ];
            for (const { granularity, timeFrame } of dayAndAbove) {
                expect(isSubDayGranularity(granularity)).toBe(false);
                const dimType = timeFrameConfigs[timeFrame].getDimensionType(
                    DimensionType.DATE,
                );
                expect(dimType).toBe(DimensionType.DATE);
            }
        });

        test('identifies sub-day granularities correctly', () => {
            expect(isSubDayGranularity(DateGranularity.SECOND)).toBe(true);
            expect(isSubDayGranularity(DateGranularity.MINUTE)).toBe(true);
            expect(isSubDayGranularity(DateGranularity.HOUR)).toBe(true);
            expect(isSubDayGranularity(DateGranularity.DAY)).toBe(false);
            expect(isSubDayGranularity(DateGranularity.YEAR)).toBe(false);
        });
    });

    describe('getDateDimension', () => {
        test('should parse dates', async () => {
            // Invalid date granularities
            expect(getDateDimension('dimension')).toEqual({});
            expect(getDateDimension('dimension_date')).toEqual({});
            expect(getDateDimension('dimension_raw')).toEqual({});

            // Valid date granularities
            expect(getDateDimension('dimension_second')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.SECOND,
            });
            expect(getDateDimension('dimension_minute')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.MINUTE,
            });
            expect(getDateDimension('dimension_hour')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.HOUR,
            });
            expect(getDateDimension('dimension_day')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.DAY,
            });
            expect(getDateDimension('table_my_dimension_day')).toEqual({
                baseDimensionId: `table_my_dimension`,
                newTimeFrame: TimeFrames.DAY,
            });
            expect(getDateDimension('dimension_week')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.WEEK,
            });
            expect(getDateDimension('dimension_month')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.MONTH,
            });
            expect(getDateDimension('dimension_quarter')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.QUARTER,
            });
            expect(getDateDimension('dimension_year')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.YEAR,
            });
        });
    });

    describe('dateTruncTimezoneConversions', () => {
        // Trino's client serializes `timestamp with time zone` as
        // "YYYY-MM-DD HH:mm:ss.SSS <zone>", which dayjs/moment can't parse.
        // `toUTC` must cast back to a naive `timestamp` so downstream parsing
        // works.
        test('Trino toUTC returns a naive timestamp at the correct UTC instant', () => {
            const { toUTC } =
                dateTruncTimezoneConversions[SupportedDbtAdapter.TRINO];
            expect(toUTC('truncated', 'America/New_York')).toEqual(
                `CAST(with_timezone(truncated, 'America/New_York') AT TIME ZONE 'UTC' AS timestamp)`,
            );
        });

        test('Trino toProjectTz returns a naive timestamp in the project zone', () => {
            const { toProjectTz } =
                dateTruncTimezoneConversions[SupportedDbtAdapter.TRINO];
            expect(toProjectTz('column', 'America/New_York')).toEqual(
                `CAST(column AT TIME ZONE 'America/New_York' AS timestamp)`,
            );
        });

        test('Athena mirrors Trino', () => {
            const trino =
                dateTruncTimezoneConversions[SupportedDbtAdapter.TRINO];
            const athena =
                dateTruncTimezoneConversions[SupportedDbtAdapter.ATHENA];
            expect(athena.toUTC('x', 'UTC')).toEqual(trino.toUTC('x', 'UTC'));
            expect(athena.toProjectTz('x', 'UTC')).toEqual(
                trino.toProjectTz('x', 'UTC'),
            );
        });

        test('ClickHouse toUTC lifts Date-returning truncs into DateTime before relabeling', () => {
            const { toUTC } =
                dateTruncTimezoneConversions[SupportedDbtAdapter.CLICKHOUSE];
            expect(toUTC('truncated', 'Asia/Tokyo')).toEqual(
                `toTimeZone(toDateTime(truncated, 'Asia/Tokyo'), 'UTC')`,
            );
        });
    });

    describe('getSqlForTruncatedDate type guard for DATE', () => {
        const tz = 'America/New_York';
        const col = 'my_col';

        test.each([
            [SupportedDbtAdapter.POSTGRES, `DATE_TRUNC('DAY', ${col})`],
            [SupportedDbtAdapter.REDSHIFT, `DATE_TRUNC('DAY', ${col})`],
            [SupportedDbtAdapter.DUCKDB, `DATE_TRUNC('DAY', ${col})`],
            [SupportedDbtAdapter.SNOWFLAKE, `DATE_TRUNC('DAY', ${col})`],
            [SupportedDbtAdapter.DATABRICKS, `DATE_TRUNC('DAY', ${col})`],
            [SupportedDbtAdapter.TRINO, `DATE_TRUNC('DAY', ${col})`],
            [SupportedDbtAdapter.ATHENA, `DATE_TRUNC('DAY', ${col})`],
            [SupportedDbtAdapter.CLICKHOUSE, `toStartOfDay(${col})`],
        ])(
            '%s: DATE dimension with timezone skips tz round-trip',
            (adapter, expected) => {
                expect(
                    getSqlForTruncatedDate(
                        adapter,
                        TimeFrames.DAY,
                        col,
                        DimensionType.DATE,
                        null,
                        tz,
                    ),
                ).toEqual(expected);
            },
        );

        test('TIMESTAMP dimension with timezone still gets tz round-trip (Postgres)', () => {
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                ),
            ).toEqual(
                `(DATE_TRUNC('DAY', (${col})::timestamptz AT TIME ZONE '${tz}')) AT TIME ZONE '${tz}'`,
            );
        });

        test('TIMESTAMP dimension with timezone still gets tz round-trip (Snowflake)', () => {
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.SNOWFLAKE,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                ),
            ).toEqual(
                `CONVERT_TIMEZONE('${tz}', 'UTC', DATE_TRUNC('DAY', CONVERT_TIMEZONE('UTC', '${tz}', ${col})))`,
            );
        });
    });
});
