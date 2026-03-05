import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';
import { getDateDimension, timeFrameConfigs, WeekDay } from './timeFrames';

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

    describe('getDateDimension', () => {
        test('should parse dates', async () => {
            // Invalid date granularities
            expect(getDateDimension('dimension_hour')).toEqual({});
            expect(getDateDimension('dimension')).toEqual({});
            expect(getDateDimension('dimension_date')).toEqual({});
            expect(getDateDimension('dimension_raw')).toEqual({});

            // Valid date granularities
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
});
