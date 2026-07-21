import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType } from '../types/field';
import { DateGranularity, TimeFrames } from '../types/timeFrames';
import {
    dateExtractsTimezoneConversions,
    dateTruncTimezoneConversions,
    extractableTimeFrames,
    getDateDimension,
    getSqlForDatePart,
    getSqlForDatePartName,
    getSqlForTruncatedDate,
    getTimeFramesWithProjectDefaults,
    isSubDayGranularity,
    isTimezoneRoundTripNoOp,
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

        test('BigQuery wrapped path shifts to a naive DATETIME, truncates, and re-attaches the zone (merge)', () => {
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.DAY,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    undefined,
                    'America/New_York',
                ),
            ).toEqual(
                "TIMESTAMP(DATETIME_TRUNC(DATETIME(TIMESTAMP(${TABLE}.created), 'America/New_York'), DAY), 'America/New_York')",
            );
        });

        test('UTC target with default (UTC) source short-circuits the wrap', () => {
            // BigQuery: avoids TIMESTAMP() cast + 3-arg overload that defeats
            // partition pruning when both sides are UTC.
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.DAY,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    undefined,
                    'UTC',
                ),
            ).toEqual('TIMESTAMP_TRUNC(${TABLE}.created, DAY)');
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    undefined,
                    'UTC',
                ),
            ).toEqual("DATE_TRUNC('DAY', ${TABLE}.created)");
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.SNOWFLAKE,
                    TimeFrames.DAY,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    undefined,
                    'UTC',
                ),
            ).toEqual("DATE_TRUNC('DAY', ${TABLE}.created)");
        });

        // Databricks/Spark timestamps are instants (the wrap would double-shift
        // them) and Trino/Athena sessions do not rebase naive columns — the
        // equal-zones skip stays for those adapters.
        test('Matching non-UTC target and source still short-circuits on instant-typed / session-inert adapters', () => {
            const tz = 'America/New_York';
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.DATABRICKS,
                    TimeFrames.DAY,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    undefined,
                    tz,
                    tz,
                ),
            ).toEqual("DATE_TRUNC('DAY', ${TABLE}.created)");
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.TRINO,
                    TimeFrames.DAY,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    undefined,
                    tz,
                    tz,
                ),
            ).toEqual("DATE_TRUNC('DAY', ${TABLE}.created)");
        });

        // Only all-UTC short-circuits: a naive column needs the wrap's inner
        // castToInstant rebase even when target and source match.
        test('Matching non-UTC target and source keeps the wrap (naive columns need the rebase)', () => {
            const tz = 'America/New_York';
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.DAY,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    undefined,
                    tz,
                    tz,
                ),
            ).toEqual(
                "TIMESTAMP(DATETIME_TRUNC(DATETIME(TIMESTAMP(${TABLE}.created), 'America/New_York'), DAY), 'America/New_York')",
            );
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.SNOWFLAKE,
                    TimeFrames.DAY,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    undefined,
                    tz,
                    tz,
                ),
            ).toEqual(
                "CONVERT_TIMEZONE('America/New_York', 'UTC', DATE_TRUNC('DAY', CONVERT_TIMEZONE('America/New_York', 'America/New_York', ${TABLE}.created)))",
            );
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    undefined,
                    tz,
                    tz,
                ),
            ).toEqual(
                "(DATE_TRUNC('DAY', (${TABLE}.created)::timestamptz AT TIME ZONE 'America/New_York')) AT TIME ZONE 'America/New_York'",
            );
        });

        test('BigQuery 2-arg TIMESTAMP_TRUNC keeps original expr unchanged (DATETIME overload still applies)', () => {
            expect(
                timeFrameConfigs[TimeFrames.DAY].getSql(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.DAY,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                ),
            ).toEqual('TIMESTAMP_TRUNC(${TABLE}.created, DAY)');
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

        test('ClickHouse toProjectTz renders project-TZ wall-clock to a naive UTC-labelled DateTime64 (merge, ms-preserving)', () => {
            const { toProjectTz } =
                dateTruncTimezoneConversions[SupportedDbtAdapter.CLICKHOUSE];
            expect(toProjectTz('col', 'America/New_York')).toEqual(
                `toDateTime64(formatDateTime(toTimeZone(col, 'America/New_York'), '%Y-%m-%d %H:%i:%S.%f'), 3, 'UTC')`,
            );
        });

        test('ClickHouse toUTC re-parses the truncated wall-clock as project-local, collapsing the DST fold (ms-preserving)', () => {
            const { toUTC } =
                dateTruncTimezoneConversions[SupportedDbtAdapter.CLICKHOUSE];
            expect(toUTC('truncated', 'America/New_York')).toEqual(
                `toTimeZone(toDateTime64(formatDateTime(truncated, '%Y-%m-%d %H:%i:%S.%f'), 3, 'America/New_York'), 'UTC')`,
            );
        });

        test('BigQuery toProjectTz shifts a TIMESTAMP-coerced instant into a naive project-TZ DATETIME (merge)', () => {
            const { toProjectTz } =
                dateTruncTimezoneConversions[SupportedDbtAdapter.BIGQUERY];
            expect(toProjectTz('col', 'America/New_York')).toEqual(
                `DATETIME(TIMESTAMP(col), 'America/New_York')`,
            );
        });

        test('BigQuery toUTC re-attaches the project zone to recover a real instant (merge)', () => {
            const { toUTC } =
                dateTruncTimezoneConversions[SupportedDbtAdapter.BIGQUERY];
            expect(toUTC('truncated', 'America/New_York')).toEqual(
                `TIMESTAMP(truncated, 'America/New_York')`,
            );
        });

        test('Snowflake toProjectTz defaults sourceTimezone to UTC', () => {
            const { toProjectTz } =
                dateTruncTimezoneConversions[SupportedDbtAdapter.SNOWFLAKE];
            expect(toProjectTz('col', 'America/New_York')).toEqual(
                `CONVERT_TIMEZONE('UTC', 'America/New_York', col)`,
            );
        });

        test('Snowflake toProjectTz threads explicit sourceTimezone into CONVERT_TIMEZONE', () => {
            const { toProjectTz } =
                dateTruncTimezoneConversions[SupportedDbtAdapter.SNOWFLAKE];
            expect(
                toProjectTz('col', 'America/New_York', 'America/New_York'),
            ).toEqual(
                `CONVERT_TIMEZONE('America/New_York', 'America/New_York', col)`,
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

        // GLITCH-452: with castDayOrCoarserToDate, a day-or-coarser trunc casts the
        // project-wall-clock value to DATE and drops the toUTC round-trip-back.
        test('day grain with castDayOrCoarserToDate casts the wall-clock trunc to DATE (Postgres)', () => {
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                    undefined,
                    undefined,
                    true, // castDayOrCoarserToDate
                ),
            ).toEqual(
                `CAST(DATE_TRUNC('DAY', (${col})::timestamptz AT TIME ZONE '${tz}') AS DATE)`,
            );
        });

        // GLITCH-452: sub-day grains are real instants — castDayOrCoarserToDate must
        // not cast them; they keep the TIMESTAMP round-trip.
        test('sub-day grain ignores castDayOrCoarserToDate and keeps the timestamp round-trip (Postgres)', () => {
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.HOUR,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                    undefined,
                    undefined,
                    true, // castDayOrCoarserToDate — ignored for sub-day
                ),
            ).toEqual(
                `(DATE_TRUNC('HOUR', (${col})::timestamptz AT TIME ZONE '${tz}')) AT TIME ZONE '${tz}'`,
            );
        });

        // GLITCH-452: a UTC project short-circuits the round-trip, but day-grain
        // output must still be a real DATE.
        test('UTC project (no round-trip) still casts day grain to DATE (Postgres)', () => {
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    'UTC',
                    undefined,
                    undefined,
                    true, // castDayOrCoarserToDate
                ),
            ).toEqual(`CAST(DATE_TRUNC('DAY', ${col}) AS DATE)`);
        });

        // GLITCH-509: BigQuery now shifts to a naive DATETIME before truncating,
        // so the day-grain trunc is already a tz-midnight wall-clock value and the
        // generic CAST(... AS DATE) reads the right calendar date (no positive-
        // offset off-by-one). Verified on BigQuery: Asia/Tokyo 15:00Z buckets to
        // the same calendar day.
        test('BigQuery day grain casts the naive DATETIME trunc to DATE (merge)', () => {
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                    undefined,
                    undefined,
                    true, // castDayOrCoarserToDate
                ),
            ).toEqual(
                `CAST(DATETIME_TRUNC(DATETIME(TIMESTAMP(${col}), '${tz}'), DAY) AS DATE)`,
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

        // When Snowflake's translator wrap is disabled and columns are stored
        // in dataTimezone, the inner CONVERT_TIMEZONE source must be that data
        // timezone — not the hardcoded 'UTC'.
        test('Snowflake threads non-UTC sourceTimezone into both CONVERT_TIMEZONE wraps', () => {
            const sourceTz = 'America/New_York';
            const queryTz = 'America/Los_Angeles';
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.SNOWFLAKE,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    queryTz,
                    sourceTz,
                ),
            ).toEqual(
                `CONVERT_TIMEZONE('${queryTz}', 'UTC', DATE_TRUNC('DAY', CONVERT_TIMEZONE('${sourceTz}', '${queryTz}', ${col})))`,
            );
        });
    });

    describe('extractableTimeFrames', () => {
        test('contains numeric and Name EXTRACT-style intervals, not truncatable ones', () => {
            expect(
                extractableTimeFrames.has(TimeFrames.DAY_OF_WEEK_INDEX),
            ).toBe(true);
            expect(extractableTimeFrames.has(TimeFrames.MONTH_NUM)).toBe(true);
            expect(extractableTimeFrames.has(TimeFrames.HOUR_OF_DAY_NUM)).toBe(
                true,
            );
            expect(extractableTimeFrames.has(TimeFrames.DAY_OF_WEEK_NAME)).toBe(
                true,
            );
            expect(extractableTimeFrames.has(TimeFrames.MONTH_NAME)).toBe(true);
            expect(extractableTimeFrames.has(TimeFrames.QUARTER_NAME)).toBe(
                true,
            );

            expect(extractableTimeFrames.has(TimeFrames.DAY)).toBe(false);
            expect(extractableTimeFrames.has(TimeFrames.WEEK)).toBe(false);
            expect(extractableTimeFrames.has(TimeFrames.RAW)).toBe(false);
        });
    });

    describe('dateExtractsTimezoneConversions', () => {
        test('BigQuery coerces to TIMESTAMP and emits AT TIME ZONE inside the EXTRACT input', () => {
            expect(
                dateExtractsTimezoneConversions[
                    SupportedDbtAdapter.BIGQUERY
                ].toExtractInputTz('col', 'America/New_York'),
            ).toEqual(`TIMESTAMP(col) AT TIME ZONE 'America/New_York'`);
        });

        test('Snowflake uses CONVERT_TIMEZONE', () => {
            expect(
                dateExtractsTimezoneConversions[
                    SupportedDbtAdapter.SNOWFLAKE
                ].toExtractInputTz('col', 'America/New_York'),
            ).toEqual(`CONVERT_TIMEZONE('UTC', 'America/New_York', col)`);
        });

        test('Snowflake threads explicit sourceTimezone into CONVERT_TIMEZONE', () => {
            expect(
                dateExtractsTimezoneConversions[
                    SupportedDbtAdapter.SNOWFLAKE
                ].toExtractInputTz(
                    'col',
                    'America/New_York',
                    'America/New_York',
                ),
            ).toEqual(
                `CONVERT_TIMEZONE('America/New_York', 'America/New_York', col)`,
            );
        });

        test('Postgres / Redshift / DuckDB share the timestamptz cast form', () => {
            const expected = `(col)::timestamptz AT TIME ZONE 'America/New_York'`;
            expect(
                dateExtractsTimezoneConversions[
                    SupportedDbtAdapter.POSTGRES
                ].toExtractInputTz('col', 'America/New_York'),
            ).toEqual(expected);
            expect(
                dateExtractsTimezoneConversions[
                    SupportedDbtAdapter.REDSHIFT
                ].toExtractInputTz('col', 'America/New_York'),
            ).toEqual(expected);
            expect(
                dateExtractsTimezoneConversions[
                    SupportedDbtAdapter.DUCKDB
                ].toExtractInputTz('col', 'America/New_York'),
            ).toEqual(expected);
        });

        test('Trino / Athena cast back to naive timestamp', () => {
            const expected = `CAST(col AT TIME ZONE 'America/New_York' AS timestamp)`;
            expect(
                dateExtractsTimezoneConversions[
                    SupportedDbtAdapter.TRINO
                ].toExtractInputTz('col', 'America/New_York'),
            ).toEqual(expected);
            expect(
                dateExtractsTimezoneConversions[
                    SupportedDbtAdapter.ATHENA
                ].toExtractInputTz('col', 'America/New_York'),
            ).toEqual(expected);
        });

        test('Databricks composes from_utc/to_utc with current_timezone', () => {
            expect(
                dateExtractsTimezoneConversions[
                    SupportedDbtAdapter.DATABRICKS
                ].toExtractInputTz('col', 'America/New_York'),
            ).toEqual(
                `from_utc_timestamp(to_utc_timestamp(col, current_timezone()), 'America/New_York')`,
            );
        });

        test('ClickHouse wraps with toTimeZone (mirrors DATE_TRUNC pattern)', () => {
            expect(
                dateExtractsTimezoneConversions[
                    SupportedDbtAdapter.CLICKHOUSE
                ].toExtractInputTz('col', 'America/New_York'),
            ).toEqual(`toTimeZone(col, 'America/New_York')`);
        });
    });

    describe('getSqlForDatePart with timezone', () => {
        const tz = 'America/New_York';
        const col = 'event_ts';

        // DAY_OF_WEEK_INDEX (no startOfWeek) — exercises the bare extract path.
        test.each([
            [
                SupportedDbtAdapter.BIGQUERY,
                `EXTRACT(DAYOFWEEK FROM TIMESTAMP(${col}) AT TIME ZONE '${tz}')`,
            ],
            [
                SupportedDbtAdapter.SNOWFLAKE,
                `DATE_PART('DOW', CONVERT_TIMEZONE('UTC', '${tz}', ${col}))`,
            ],
            [
                SupportedDbtAdapter.POSTGRES,
                `DATE_PART('DOW', (${col})::timestamptz AT TIME ZONE '${tz}')`,
            ],
            [
                SupportedDbtAdapter.REDSHIFT,
                `DATE_PART('DOW', (${col})::timestamptz AT TIME ZONE '${tz}')`,
            ],
            [
                SupportedDbtAdapter.DUCKDB,
                `DATE_PART('DOW', (${col})::timestamptz AT TIME ZONE '${tz}')`,
            ],
            [
                SupportedDbtAdapter.DATABRICKS,
                `DATE_PART('DOW', from_utc_timestamp(to_utc_timestamp(${col}, current_timezone()), '${tz}'))`,
            ],
            [
                SupportedDbtAdapter.TRINO,
                `EXTRACT(DOW FROM CAST(${col} AT TIME ZONE '${tz}' AS timestamp))`,
            ],
            [
                SupportedDbtAdapter.ATHENA,
                `EXTRACT(DOW FROM CAST(${col} AT TIME ZONE '${tz}' AS timestamp))`,
            ],
            [
                SupportedDbtAdapter.CLICKHOUSE,
                `toDayOfWeek(toTimeZone(${col}, '${tz}'))`,
            ],
        ])('%s: DAY_OF_WEEK_INDEX wraps input in tz', (adapter, expected) => {
            expect(
                getSqlForDatePart(
                    adapter,
                    TimeFrames.DAY_OF_WEEK_INDEX,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                ),
            ).toEqual(expected);
        });

        // MONTH_NUM — exercises the standard EXTRACT(part FROM ...) path.
        test.each([
            [
                SupportedDbtAdapter.BIGQUERY,
                `EXTRACT(MONTH FROM TIMESTAMP(${col}) AT TIME ZONE '${tz}')`,
            ],
            [
                SupportedDbtAdapter.SNOWFLAKE,
                `DATE_PART('MONTH', CONVERT_TIMEZONE('UTC', '${tz}', ${col}))`,
            ],
            [
                SupportedDbtAdapter.POSTGRES,
                `DATE_PART('MONTH', (${col})::timestamptz AT TIME ZONE '${tz}')`,
            ],
            [
                SupportedDbtAdapter.REDSHIFT,
                `DATE_PART('MONTH', (${col})::timestamptz AT TIME ZONE '${tz}')`,
            ],
            [
                SupportedDbtAdapter.DUCKDB,
                `DATE_PART('MONTH', (${col})::timestamptz AT TIME ZONE '${tz}')`,
            ],
            [
                SupportedDbtAdapter.DATABRICKS,
                `DATE_PART('MONTH', from_utc_timestamp(to_utc_timestamp(${col}, current_timezone()), '${tz}'))`,
            ],
            [
                SupportedDbtAdapter.TRINO,
                `EXTRACT(MONTH FROM CAST(${col} AT TIME ZONE '${tz}' AS timestamp))`,
            ],
            [
                SupportedDbtAdapter.ATHENA,
                `EXTRACT(MONTH FROM CAST(${col} AT TIME ZONE '${tz}' AS timestamp))`,
            ],
            [
                SupportedDbtAdapter.CLICKHOUSE,
                `toMonth(toTimeZone(${col}, '${tz}'))`,
            ],
        ])('%s: MONTH_NUM wraps input in tz', (adapter, expected) => {
            expect(
                getSqlForDatePart(
                    adapter,
                    TimeFrames.MONTH_NUM,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                ),
            ).toEqual(expected);
        });

        test('flag-off (no timezone arg): byte-identical to bare EXTRACT', () => {
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY_OF_WEEK_INDEX,
                    col,
                    DimensionType.TIMESTAMP,
                ),
            ).toEqual(`DATE_PART('DOW', ${col})`);
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.MONTH_NUM,
                    col,
                    DimensionType.TIMESTAMP,
                ),
            ).toEqual(`EXTRACT(MONTH FROM ${col})`);
        });

        test('all-UTC short-circuits the wrap; matching non-UTC keeps it', () => {
            // UTC default source — most common BQ case, partition-pruning sensitive.
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.MONTH_NUM,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    'UTC',
                ),
            ).toEqual(`EXTRACT(MONTH FROM ${col})`);
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY_OF_WEEK_INDEX,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    'UTC',
                ),
            ).toEqual(`DATE_PART('DOW', ${col})`);
            // Matching non-UTC pair: a naive column still needs the
            // session-tz rebase inside the wrap.
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.MONTH_NUM,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    'America/New_York',
                    'America/New_York',
                ),
            ).toEqual(
                `EXTRACT(MONTH FROM TIMESTAMP(${col}) AT TIME ZONE 'America/New_York')`,
            );
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY_OF_WEEK_INDEX,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    'America/New_York',
                    'America/New_York',
                ),
            ).toEqual(
                `DATE_PART('DOW', (${col})::timestamptz AT TIME ZONE 'America/New_York')`,
            );
        });

        test('DATE base dimension with timezone short-circuits (no wrap)', () => {
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY_OF_WEEK_INDEX,
                    col,
                    DimensionType.DATE,
                    null,
                    tz,
                ),
            ).toEqual(`DATE_PART('DOW', ${col})`);
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.MONTH_NUM,
                    col,
                    DimensionType.DATE,
                    null,
                    tz,
                ),
            ).toEqual(`EXTRACT(MONTH FROM ${col})`);
        });

        test('WEEK_NUM with non-default startOfWeek composes with the tz wrap (Postgres)', () => {
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.WEEK_NUM,
                    col,
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                    tz,
                ),
            ).toEqual(
                `DATE_PART('WEEK', ((${col})::timestamptz AT TIME ZONE '${tz}' - interval '2 days'))`,
            );
        });

        test('WEEK_NUM with non-default startOfWeek composes with the tz wrap (BigQuery)', () => {
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.WEEK_NUM,
                    col,
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                    tz,
                ),
            ).toEqual(
                `EXTRACT(WEEK(WEDNESDAY) FROM TIMESTAMP(${col}) AT TIME ZONE '${tz}')`,
            );
        });

        test('DAY_OF_WEEK_INDEX with startOfWeek composes mod arithmetic with tz wrap (Postgres)', () => {
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY_OF_WEEK_INDEX,
                    col,
                    DimensionType.TIMESTAMP,
                    WeekDay.MONDAY,
                    tz,
                ),
            ).toEqual(
                `MOD(CAST(DATE_PART('DOW', (${col})::timestamptz AT TIME ZONE '${tz}') AS INT) - 1 + 7, 7) + 1`,
            );
        });

        test('DAY_OF_WEEK_INDEX with startOfWeek composes mod arithmetic with tz wrap (BigQuery)', () => {
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.DAY_OF_WEEK_INDEX,
                    col,
                    DimensionType.TIMESTAMP,
                    WeekDay.MONDAY,
                    tz,
                ),
            ).toEqual(
                `MOD(EXTRACT(DAYOFWEEK FROM TIMESTAMP(${col}) AT TIME ZONE '${tz}') - 2 + 7, 7) + 1`,
            );
        });

        // Snowflake EXTRACT path must use the column's actual source timezone
        // when the translator wrap is disabled.
        test('Snowflake threads non-UTC sourceTimezone into EXTRACT input wrap', () => {
            const sourceTz = 'America/New_York';
            const queryTz = 'America/Los_Angeles';
            expect(
                getSqlForDatePart(
                    SupportedDbtAdapter.SNOWFLAKE,
                    TimeFrames.MONTH_NUM,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    queryTz,
                    sourceTz,
                ),
            ).toEqual(
                `DATE_PART('MONTH', CONVERT_TIMEZONE('${sourceTz}', '${queryTz}', ${col}))`,
            );
        });
    });

    describe('getSqlForDatePartName with timezone (Name variants)', () => {
        const tz = 'America/New_York';
        const col = 'event_ts';

        test.each([
            [
                SupportedDbtAdapter.BIGQUERY,
                `FORMAT_TIMESTAMP('%A', TIMESTAMP(${col}), '${tz}')`,
            ],
            [
                SupportedDbtAdapter.POSTGRES,
                `TO_CHAR((${col})::timestamptz AT TIME ZONE '${tz}', 'FMDay')`,
            ],
            [
                SupportedDbtAdapter.SNOWFLAKE,
                `DECODE(TO_CHAR(CONVERT_TIMEZONE('UTC', '${tz}', ${col}), 'DY'), 'Mon', 'Monday', 'Tue', 'Tuesday', 'Wed', 'Wednesday', 'Thu', 'Thursday', 'Fri', 'Friday', 'Sat', 'Saturday', 'Sun', 'Sunday')`,
            ],
            [
                SupportedDbtAdapter.DATABRICKS,
                `DATE_FORMAT(from_utc_timestamp(to_utc_timestamp(${col}, current_timezone()), '${tz}'), 'EEEE')`,
            ],
            [
                SupportedDbtAdapter.CLICKHOUSE,
                `dateName('weekday', toTimeZone(${col}, '${tz}'))`,
            ],
            [
                SupportedDbtAdapter.TRINO,
                `date_format(CAST(${col} AT TIME ZONE '${tz}' AS timestamp), '%W')`,
            ],
        ])('%s: DAY_OF_WEEK_NAME wraps input in tz', (adapter, expected) => {
            expect(
                getSqlForDatePartName(
                    adapter,
                    TimeFrames.DAY_OF_WEEK_NAME,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                ),
            ).toEqual(expected);
        });

        test('DATE base dimension with timezone short-circuits (Postgres)', () => {
            expect(
                getSqlForDatePartName(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.MONTH_NAME,
                    col,
                    DimensionType.DATE,
                    null,
                    tz,
                ),
            ).toEqual(`TO_CHAR(${col}, 'FMMonth')`);
        });

        test('flag-off: byte-identical to bare format', () => {
            expect(
                getSqlForDatePartName(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.MONTH_NAME,
                    col,
                    DimensionType.TIMESTAMP,
                ),
            ).toEqual(`TO_CHAR(${col}, 'FMMonth')`);
            expect(
                getSqlForDatePartName(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.MONTH_NAME,
                    col,
                    DimensionType.TIMESTAMP,
                ),
            ).toEqual(`FORMAT_DATETIME('%B', ${col})`);
        });

        test('all-UTC short-circuits the wrap; matching non-UTC keeps it', () => {
            expect(
                getSqlForDatePartName(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.MONTH_NAME,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    'UTC',
                ),
            ).toEqual(`FORMAT_DATETIME('%B', ${col})`);
            // Matching non-UTC pair: a naive column still needs the
            // session-tz rebase inside the wrap.
            expect(
                getSqlForDatePartName(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.MONTH_NAME,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    'America/New_York',
                    'America/New_York',
                ),
            ).toEqual(
                `TO_CHAR((${col})::timestamptz AT TIME ZONE 'America/New_York', 'FMMonth')`,
            );
            expect(
                getSqlForDatePartName(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.MONTH_NAME,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    'America/New_York',
                    'America/New_York',
                ),
            ).toEqual(
                `FORMAT_TIMESTAMP('%B', TIMESTAMP(${col}), 'America/New_York')`,
            );
        });

        test.each([
            [TimeFrames.DAY_OF_WEEK_NAME, '%A'],
            [TimeFrames.MONTH_NAME, '%B'],
            [TimeFrames.QUARTER_NAME, 'Q%Q'],
        ])(
            'BigQuery %s: native FORMAT_TIMESTAMP with tz arg (no AT TIME ZONE)',
            (timeFrame, format) => {
                expect(
                    getSqlForDatePartName(
                        SupportedDbtAdapter.BIGQUERY,
                        timeFrame,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                    ),
                ).toEqual(
                    `FORMAT_TIMESTAMP('${format}', TIMESTAMP(${col}), '${tz}')`,
                );
            },
        );
    });

    describe('getTimeFramesWithProjectDefaults', () => {
        it('returns built-in defaults unchanged when no additions are given', () => {
            expect(
                getTimeFramesWithProjectDefaults(DimensionType.DATE),
            ).toEqual([
                TimeFrames.DAY,
                TimeFrames.WEEK,
                TimeFrames.MONTH,
                TimeFrames.QUARTER,
                TimeFrames.YEAR,
            ]);
            expect(
                getTimeFramesWithProjectDefaults(DimensionType.TIMESTAMP),
            ).toEqual([
                TimeFrames.RAW,
                TimeFrames.DAY,
                TimeFrames.WEEK,
                TimeFrames.MONTH,
                TimeFrames.QUARTER,
                TimeFrames.YEAR,
            ]);
        });

        it('appends timestamp additions after the built-in defaults', () => {
            expect(
                getTimeFramesWithProjectDefaults(DimensionType.TIMESTAMP, {
                    date: [],
                    timestamp: [TimeFrames.HOUR],
                }),
            ).toEqual([
                TimeFrames.RAW,
                TimeFrames.DAY,
                TimeFrames.WEEK,
                TimeFrames.MONTH,
                TimeFrames.QUARTER,
                TimeFrames.YEAR,
                TimeFrames.HOUR,
            ]);
        });

        it('appends a custom granularity name for date dimensions', () => {
            expect(
                getTimeFramesWithProjectDefaults(DimensionType.DATE, {
                    date: ['fiscal_week'],
                    timestamp: [],
                }),
            ).toEqual([
                TimeFrames.DAY,
                TimeFrames.WEEK,
                TimeFrames.MONTH,
                TimeFrames.QUARTER,
                TimeFrames.YEAR,
                'fiscal_week',
            ]);
        });

        it('de-duplicates an addition that already exists in the built-in defaults', () => {
            expect(
                getTimeFramesWithProjectDefaults(DimensionType.DATE, {
                    date: [TimeFrames.DAY],
                    timestamp: [],
                }),
            ).toEqual([
                TimeFrames.DAY,
                TimeFrames.WEEK,
                TimeFrames.MONTH,
                TimeFrames.QUARTER,
                TimeFrames.YEAR,
            ]);
        });
    });

    describe('castToInstant', () => {
        const sql = '${TABLE}.created';

        test('rebases a naive timestamp via the session timezone on session-property warehouses', () => {
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.BIGQUERY
                ].castToInstant(sql),
            ).toEqual('TIMESTAMP(${TABLE}.created)');
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.POSTGRES
                ].castToInstant(sql),
            ).toEqual('(${TABLE}.created)::timestamptz');
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.REDSHIFT
                ].castToInstant(sql),
            ).toEqual('(${TABLE}.created)::timestamptz');
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.DUCKDB
                ].castToInstant(sql),
            ).toEqual('(${TABLE}.created)::timestamptz');
        });

        test('pins ClickHouse serialization to UTC (values are instants)', () => {
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.CLICKHOUSE
                ].castToInstant(sql),
            ).toEqual("toTimeZone(${TABLE}.created, 'UTC')");
        });

        test('is identity where naive columns are handled elsewhere or the type is already an instant', () => {
            // Snowflake: dbt translator already wraps naive columns to UTC.
            // Databricks/Spark: TIMESTAMP is an instant — a rebase would double-shift.
            // Trino/Athena: naive raw handling tracked separately.
            [
                SupportedDbtAdapter.SNOWFLAKE,
                SupportedDbtAdapter.DATABRICKS,
                SupportedDbtAdapter.SPARK,
                SupportedDbtAdapter.TRINO,
                SupportedDbtAdapter.ATHENA,
            ].forEach((adapter) => {
                expect(
                    dateTruncTimezoneConversions[adapter].castToInstant(sql),
                ).toEqual(sql);
            });
        });

        test('is the inner term of toProjectTz (composition cannot drift)', () => {
            const tz = 'America/New_York';
            (
                [
                    [
                        SupportedDbtAdapter.BIGQUERY,
                        (inner: string) => `DATETIME(${inner}, '${tz}')`,
                    ],
                    [
                        SupportedDbtAdapter.POSTGRES,
                        (inner: string) => `${inner} AT TIME ZONE '${tz}'`,
                    ],
                    [
                        SupportedDbtAdapter.REDSHIFT,
                        (inner: string) => `${inner} AT TIME ZONE '${tz}'`,
                    ],
                    [
                        SupportedDbtAdapter.DUCKDB,
                        (inner: string) => `${inner} AT TIME ZONE '${tz}'`,
                    ],
                ] as const
            ).forEach(([adapter, outer]) => {
                const { toProjectTz, castToInstant } =
                    dateTruncTimezoneConversions[adapter];
                expect(toProjectTz(sql, tz)).toEqual(outer(castToInstant(sql)));
            });
        });
    });

    describe('castNaiveToInstant (known-naive timestamp domain)', () => {
        const col = 'event_ts';
        const z = 'Asia/Tokyo';
        const tz = 'America/New_York';

        test('castNaiveAggregateToInstant matches castNaiveToInstant except on Snowflake', () => {
            Object.values(SupportedDbtAdapter).forEach((adapter) => {
                const conversions = dateTruncTimezoneConversions[adapter];
                if (adapter === SupportedDbtAdapter.SNOWFLAKE) {
                    // Dim path stays on the compile-time wrap; aggregates see
                    // the bare column and rebase explicitly (NTZ-only input)
                    expect(conversions.castNaiveToInstant).toBeNull();
                    expect(
                        conversions.castNaiveAggregateToInstant?.(col, z),
                    ).toEqual(`CONVERT_TIMEZONE('${z}', 'UTC', ${col})`);
                } else if (conversions.castNaiveToInstant === null) {
                    expect(conversions.castNaiveAggregateToInstant).toBeNull();
                } else {
                    expect(
                        conversions.castNaiveAggregateToInstant?.(col, z),
                    ).toEqual(conversions.castNaiveToInstant(col, z));
                }
            });
        });

        test('per-adapter explicit rebase from the data timezone', () => {
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.POSTGRES
                ].castNaiveToInstant?.(col, z),
            ).toEqual(`((${col}) AT TIME ZONE '${z}')`);
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.REDSHIFT
                ].castNaiveToInstant?.(col, z),
            ).toEqual(`((${col}) AT TIME ZONE '${z}')`);
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.DUCKDB
                ].castNaiveToInstant?.(col, z),
            ).toEqual(`((${col}) AT TIME ZONE '${z}')`);
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.BIGQUERY
                ].castNaiveToInstant?.(col, z),
            ).toEqual(`TIMESTAMP(${col}, '${z}')`);
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.DATABRICKS
                ].castNaiveToInstant?.(col, z),
            ).toEqual(
                `CAST(to_utc_timestamp(${col}, '${z}') AS TIMESTAMP_NTZ)`,
            );
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.SPARK
                ].castNaiveToInstant?.(col, z),
            ).toEqual(
                `CAST(to_utc_timestamp(${col}, '${z}') AS TIMESTAMP_NTZ)`,
            );
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.TRINO
                ].castNaiveToInstant?.(col, z),
            ).toEqual(
                `CAST(with_timezone(${col}, '${z}') AT TIME ZONE 'UTC' AS timestamp)`,
            );
            expect(
                dateTruncTimezoneConversions[
                    SupportedDbtAdapter.ATHENA
                ].castNaiveToInstant?.(col, z),
            ).toEqual(
                `CAST(with_timezone(${col}, '${z}') AT TIME ZONE 'UTC' AS timestamp)`,
            );
        });

        test('never fires for Snowflake (compile-time wrap) or ClickHouse (no naive columns)', () => {
            expect(
                dateTruncTimezoneConversions[SupportedDbtAdapter.SNOWFLAKE]
                    .castNaiveToInstant,
            ).toBeNull();
            expect(
                dateTruncTimezoneConversions[SupportedDbtAdapter.CLICKHOUSE]
                    .castNaiveToInstant,
            ).toBeNull();
        });

        describe('truncated frames substitute the naive rebase for the inner castToInstant', () => {
            test('Postgres day grain', () => {
                expect(
                    getSqlForTruncatedDate(
                        SupportedDbtAdapter.POSTGRES,
                        TimeFrames.DAY,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(
                    `(DATE_TRUNC('DAY', ((${col}) AT TIME ZONE '${z}') AT TIME ZONE '${tz}')) AT TIME ZONE '${tz}'`,
                );
            });

            test('Postgres hour grain', () => {
                expect(
                    getSqlForTruncatedDate(
                        SupportedDbtAdapter.POSTGRES,
                        TimeFrames.HOUR,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(
                    `(DATE_TRUNC('HOUR', ((${col}) AT TIME ZONE '${z}') AT TIME ZONE '${tz}')) AT TIME ZONE '${tz}'`,
                );
            });

            test('BigQuery day grain', () => {
                expect(
                    getSqlForTruncatedDate(
                        SupportedDbtAdapter.BIGQUERY,
                        TimeFrames.DAY,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(
                    `TIMESTAMP(DATETIME_TRUNC(DATETIME(TIMESTAMP(${col}, '${z}'), '${tz}'), DAY), '${tz}')`,
                );
            });

            test('BigQuery hour grain', () => {
                expect(
                    getSqlForTruncatedDate(
                        SupportedDbtAdapter.BIGQUERY,
                        TimeFrames.HOUR,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(
                    `TIMESTAMP(DATETIME_TRUNC(DATETIME(TIMESTAMP(${col}, '${z}'), '${tz}'), HOUR), '${tz}')`,
                );
            });

            test('Trino day grain', () => {
                const naiveUtc = `CAST(with_timezone(${col}, '${z}') AT TIME ZONE 'UTC' AS timestamp)`;
                const input = `CAST(with_timezone(${naiveUtc}, 'UTC') AT TIME ZONE '${tz}' AS timestamp)`;
                expect(
                    getSqlForTruncatedDate(
                        SupportedDbtAdapter.TRINO,
                        TimeFrames.DAY,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(
                    `CAST(with_timezone(DATE_TRUNC('DAY', ${input}), '${tz}') AT TIME ZONE 'UTC' AS timestamp)`,
                );
            });

            test('Trino hour grain', () => {
                const naiveUtc = `CAST(with_timezone(${col}, '${z}') AT TIME ZONE 'UTC' AS timestamp)`;
                const input = `CAST(with_timezone(${naiveUtc}, 'UTC') AT TIME ZONE '${tz}' AS timestamp)`;
                expect(
                    getSqlForTruncatedDate(
                        SupportedDbtAdapter.TRINO,
                        TimeFrames.HOUR,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(
                    `CAST(with_timezone(DATE_TRUNC('HOUR', CAST(${input} AS TIMESTAMP)), '${tz}') AT TIME ZONE 'UTC' AS timestamp)`,
                );
            });

            test('Databricks day grain', () => {
                const input = `from_utc_timestamp(CAST(to_utc_timestamp(${col}, '${z}') AS TIMESTAMP_NTZ), '${tz}')`;
                expect(
                    getSqlForTruncatedDate(
                        SupportedDbtAdapter.DATABRICKS,
                        TimeFrames.DAY,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(
                    `CAST(to_utc_timestamp(DATE_TRUNC('DAY', ${input}), '${tz}') AS TIMESTAMP_NTZ)`,
                );
            });

            test('Databricks hour grain', () => {
                const input = `from_utc_timestamp(CAST(to_utc_timestamp(${col}, '${z}') AS TIMESTAMP_NTZ), '${tz}')`;
                expect(
                    getSqlForTruncatedDate(
                        SupportedDbtAdapter.DATABRICKS,
                        TimeFrames.HOUR,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(
                    `CAST(to_utc_timestamp(DATE_TRUNC('HOUR', ${input}), '${tz}') AS TIMESTAMP_NTZ)`,
                );
            });
        });

        // The wider target == source skip is only valid for aware/unknown
        // columns — a known-naive column still needs the rebase.
        test('Trino/Databricks naive at display == data timezone still applies the rebase', () => {
            const naiveUtc = `CAST(with_timezone(${col}, '${tz}') AT TIME ZONE 'UTC' AS timestamp)`;
            const trinoInput = `CAST(with_timezone(${naiveUtc}, 'UTC') AT TIME ZONE '${tz}' AS timestamp)`;
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.TRINO,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                    tz,
                    'naive',
                ),
            ).toEqual(
                `CAST(with_timezone(DATE_TRUNC('DAY', ${trinoInput}), '${tz}') AT TIME ZONE 'UTC' AS timestamp)`,
            );
            const databricksInput = `from_utc_timestamp(CAST(to_utc_timestamp(${col}, '${tz}') AS TIMESTAMP_NTZ), '${tz}')`;
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.DATABRICKS,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                    tz,
                    'naive',
                ),
            ).toEqual(
                `CAST(to_utc_timestamp(DATE_TRUNC('DAY', ${databricksInput}), '${tz}') AS TIMESTAMP_NTZ)`,
            );
        });

        test('naive at all-UTC still short-circuits (no wrap)', () => {
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    'UTC',
                    'UTC',
                    'naive',
                ),
            ).toEqual(`DATE_TRUNC('DAY', ${col})`);
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.TRINO,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    'UTC',
                    'UTC',
                    'naive',
                ),
            ).toEqual(`DATE_TRUNC('DAY', ${col})`);
        });

        test('aware and unknown domains stay byte-identical to today', () => {
            (
                [
                    SupportedDbtAdapter.POSTGRES,
                    SupportedDbtAdapter.BIGQUERY,
                    SupportedDbtAdapter.TRINO,
                    SupportedDbtAdapter.SNOWFLAKE,
                ] as const
            ).forEach((adapter) => {
                const unknown = getSqlForTruncatedDate(
                    adapter,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                    z,
                );
                expect(
                    getSqlForTruncatedDate(
                        adapter,
                        TimeFrames.DAY,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'aware',
                    ),
                ).toEqual(unknown);
            });
            // Aware/unknown on the equal-zones adapters keep the skip.
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.TRINO,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                    tz,
                    'aware',
                ),
            ).toEqual(`DATE_TRUNC('DAY', ${col})`);
        });

        test('Snowflake is excluded — naive emits exactly the legacy wrap', () => {
            const legacy = getSqlForTruncatedDate(
                SupportedDbtAdapter.SNOWFLAKE,
                TimeFrames.DAY,
                col,
                DimensionType.TIMESTAMP,
                null,
                tz,
                z,
            );
            expect(
                getSqlForTruncatedDate(
                    SupportedDbtAdapter.SNOWFLAKE,
                    TimeFrames.DAY,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                    z,
                    'naive',
                ),
            ).toEqual(legacy);
        });

        describe('EXTRACT frames substitute the naive rebase in the input wrap', () => {
            test.each([
                [
                    SupportedDbtAdapter.POSTGRES,
                    `DATE_PART('MONTH', ((${col}) AT TIME ZONE '${z}') AT TIME ZONE '${tz}')`,
                ],
                [
                    SupportedDbtAdapter.BIGQUERY,
                    `EXTRACT(MONTH FROM TIMESTAMP(${col}, '${z}') AT TIME ZONE '${tz}')`,
                ],
                [
                    SupportedDbtAdapter.TRINO,
                    `EXTRACT(MONTH FROM CAST(with_timezone(CAST(with_timezone(${col}, '${z}') AT TIME ZONE 'UTC' AS timestamp), 'UTC') AT TIME ZONE '${tz}' AS timestamp))`,
                ],
                [
                    SupportedDbtAdapter.DATABRICKS,
                    `DATE_PART('MONTH', from_utc_timestamp(CAST(to_utc_timestamp(${col}, '${z}') AS TIMESTAMP_NTZ), '${tz}'))`,
                ],
            ])('%s: MONTH_NUM naive', (adapter, expected) => {
                expect(
                    getSqlForDatePart(
                        adapter,
                        TimeFrames.MONTH_NUM,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(expected);
            });

            test('naive at display == data timezone still rebases on Trino/Databricks', () => {
                expect(
                    getSqlForDatePart(
                        SupportedDbtAdapter.TRINO,
                        TimeFrames.MONTH_NUM,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        tz,
                        'naive',
                    ),
                ).toEqual(
                    `EXTRACT(MONTH FROM CAST(with_timezone(CAST(with_timezone(${col}, '${tz}') AT TIME ZONE 'UTC' AS timestamp), 'UTC') AT TIME ZONE '${tz}' AS timestamp))`,
                );
                expect(
                    getSqlForDatePart(
                        SupportedDbtAdapter.DATABRICKS,
                        TimeFrames.MONTH_NUM,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        tz,
                        'naive',
                    ),
                ).toEqual(
                    `DATE_PART('MONTH', from_utc_timestamp(CAST(to_utc_timestamp(${col}, '${tz}') AS TIMESTAMP_NTZ), '${tz}'))`,
                );
            });

            test('Name variants: BigQuery coerces the naive column with the zoned TIMESTAMP overload', () => {
                expect(
                    getSqlForDatePartName(
                        SupportedDbtAdapter.BIGQUERY,
                        TimeFrames.MONTH_NAME,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(
                    `FORMAT_TIMESTAMP('%B', TIMESTAMP(${col}, '${z}'), '${tz}')`,
                );
            });

            test('Name variants: Postgres rebases the naive column before TO_CHAR', () => {
                expect(
                    getSqlForDatePartName(
                        SupportedDbtAdapter.POSTGRES,
                        TimeFrames.MONTH_NAME,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'naive',
                    ),
                ).toEqual(
                    `TO_CHAR(((${col}) AT TIME ZONE '${z}') AT TIME ZONE '${tz}', 'FMMonth')`,
                );
            });

            test('aware/unknown EXTRACT stays byte-identical to today', () => {
                const unknown = getSqlForDatePart(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.MONTH_NUM,
                    col,
                    DimensionType.TIMESTAMP,
                    null,
                    tz,
                    z,
                );
                expect(
                    getSqlForDatePart(
                        SupportedDbtAdapter.POSTGRES,
                        TimeFrames.MONTH_NUM,
                        col,
                        DimensionType.TIMESTAMP,
                        null,
                        tz,
                        z,
                        'aware',
                    ),
                ).toEqual(unknown);
            });
        });

        describe('isTimezoneRoundTripNoOp is domain-scoped', () => {
            const ny = 'America/New_York';

            test('known-naive: no-op only when both zones are UTC', () => {
                expect(
                    isTimezoneRoundTripNoOp(
                        SupportedDbtAdapter.TRINO,
                        ny,
                        ny,
                        'naive',
                    ),
                ).toBe(false);
                expect(
                    isTimezoneRoundTripNoOp(
                        SupportedDbtAdapter.DATABRICKS,
                        ny,
                        ny,
                        'naive',
                    ),
                ).toBe(false);
                expect(
                    isTimezoneRoundTripNoOp(
                        SupportedDbtAdapter.POSTGRES,
                        'UTC',
                        'UTC',
                        'naive',
                    ),
                ).toBe(true);
                expect(
                    isTimezoneRoundTripNoOp(
                        SupportedDbtAdapter.TRINO,
                        'UTC',
                        undefined,
                        'naive',
                    ),
                ).toBe(true);
            });

            test('known-aware and unknown keep the per-adapter legacy predicate', () => {
                expect(
                    isTimezoneRoundTripNoOp(
                        SupportedDbtAdapter.TRINO,
                        ny,
                        ny,
                        'aware',
                    ),
                ).toBe(true);
                expect(
                    isTimezoneRoundTripNoOp(SupportedDbtAdapter.TRINO, ny, ny),
                ).toBe(true);
                expect(
                    isTimezoneRoundTripNoOp(
                        SupportedDbtAdapter.POSTGRES,
                        ny,
                        ny,
                        'aware',
                    ),
                ).toBe(false);
            });

            test('excluded adapters treat naive like unknown', () => {
                // Snowflake keeps the legacy both-UTC predicate even for naive.
                expect(
                    isTimezoneRoundTripNoOp(
                        SupportedDbtAdapter.SNOWFLAKE,
                        'UTC',
                        'UTC',
                        'naive',
                    ),
                ).toBe(true);
                expect(
                    isTimezoneRoundTripNoOp(
                        SupportedDbtAdapter.SNOWFLAKE,
                        ny,
                        ny,
                        'naive',
                    ),
                ).toBe(false);
            });
        });
    });
});
