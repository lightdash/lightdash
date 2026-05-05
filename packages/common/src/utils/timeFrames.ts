import { SupportedDbtAdapter } from '../types/dbt';
import { ParseError } from '../types/errors';
import { DimensionType } from '../types/field';
import { DateGranularity, TimeFrames } from '../types/timeFrames';

export enum WeekDay {
    MONDAY,
    TUESDAY,
    WEDNESDAY,
    THURSDAY,
    FRIDAY,
    SATURDAY,
    SUNDAY,
}

export const isWeekDay = (value: unknown): value is WeekDay =>
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 6;

const nullTimeFrameMap: Record<TimeFrames, null> = {
    DAY: null,
    DAY_OF_MONTH_NUM: null,
    DAY_OF_WEEK_INDEX: null,
    DAY_OF_WEEK_NAME: null,
    DAY_OF_YEAR_NUM: null,
    HOUR: null,
    MILLISECOND: null,
    MINUTE: null,
    MONTH: null,
    MONTH_NAME: null,
    MONTH_NUM: null,
    QUARTER: null,
    QUARTER_NAME: null,
    QUARTER_NUM: null,
    RAW: null,
    SECOND: null,
    WEEK: null,
    WEEK_NUM: null,
    YEAR: null,
    YEAR_NUM: null,
    HOUR_OF_DAY_NUM: null,
    MINUTE_OF_HOUR_NUM: null,
};

const timeFrameToDatePartMap: Record<TimeFrames, string | null> = {
    ...nullTimeFrameMap,
    [TimeFrames.DAY_OF_WEEK_INDEX]: 'DOW',
    [TimeFrames.DAY_OF_MONTH_NUM]: 'DAY',
    [TimeFrames.DAY_OF_YEAR_NUM]: 'DOY',
    [TimeFrames.WEEK_NUM]: 'WEEK',
    [TimeFrames.MONTH_NUM]: 'MONTH',
    [TimeFrames.QUARTER_NUM]: 'QUARTER',
    [TimeFrames.YEAR_NUM]: 'YEAR',
    [TimeFrames.HOUR_OF_DAY_NUM]: 'HOUR',
    [TimeFrames.MINUTE_OF_HOUR_NUM]: 'MINUTE',
};

type WarehouseConfig = {
    // `timezone` is only used by BigQuery (native TIMESTAMP_TRUNC support);
    // other warehouses convert via dateTruncTimezoneConversions instead.
    getSqlForTruncatedDate: (
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
        startOfWeek?: WeekDay | null,
        timezone?: string,
    ) => string;
    getSqlForDatePart: (
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
        startOfWeek?: WeekDay | null,
    ) => string;
    getSqlForDatePartName: (
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
        timezone?: string,
    ) => string;
};

/** Per-warehouse SQL for the DATE_TRUNC timezone round-trip. `toProjectTz`
 *  shifts into project-local wall-clock before truncation; `toUTC` converts
 *  the truncated value back into a proper UTC instant. */
type DateTruncTimezoneConversion = {
    toProjectTz: (sql: string, tz: string) => string;
    toUTC: (sql: string, tz: string) => string;
};

export const dateTruncTimezoneConversions: Record<
    SupportedDbtAdapter,
    DateTruncTimezoneConversion
> = {
    // BigQuery: TIMESTAMP_TRUNC accepts timezone natively and preserves the
    // UTC instant — round-trip is a no-op.
    [SupportedDbtAdapter.BIGQUERY]: {
        toProjectTz: (sql) => sql,
        toUTC: (sql) => sql,
    },
    [SupportedDbtAdapter.SNOWFLAKE]: {
        toProjectTz: (sql, tz) => `CONVERT_TIMEZONE('UTC', '${tz}', ${sql})`,
        toUTC: (sql, tz) => `CONVERT_TIMEZONE('${tz}', 'UTC', ${sql})`,
    },
    [SupportedDbtAdapter.POSTGRES]: {
        toProjectTz: (sql, tz) => `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
        toUTC: (sql, tz) => `(${sql}) AT TIME ZONE '${tz}'`,
    },
    [SupportedDbtAdapter.REDSHIFT]: {
        toProjectTz: (sql, tz) => `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
        toUTC: (sql, tz) => `(${sql}) AT TIME ZONE '${tz}'`,
    },
    [SupportedDbtAdapter.DUCKDB]: {
        toProjectTz: (sql, tz) => `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
        toUTC: (sql, tz) => `(${sql}) AT TIME ZONE '${tz}'`,
    },
    [SupportedDbtAdapter.DATABRICKS]: {
        toProjectTz: (sql, tz) =>
            `from_utc_timestamp(to_utc_timestamp(${sql}, current_timezone()), '${tz}')`,
        toUTC: (sql, tz) => `to_utc_timestamp(${sql}, '${tz}')`,
    },
    // Trino returns `timestamp with time zone` values as strings like
    // "2024-01-14 00:00:00.000 America/New_York", which dayjs/moment can't
    // parse — so `toUTC` casts the UTC-shifted result back to a naive
    // `timestamp`. `with_timezone` attaches the project zone explicitly
    // (independent of session zone) before shifting to UTC.
    [SupportedDbtAdapter.TRINO]: {
        toProjectTz: (sql, tz) =>
            `CAST(${sql} AT TIME ZONE '${tz}' AS timestamp)`,
        toUTC: (sql, tz) =>
            `CAST(with_timezone(${sql}, '${tz}') AT TIME ZONE 'UTC' AS timestamp)`,
    },
    [SupportedDbtAdapter.ATHENA]: {
        toProjectTz: (sql, tz) =>
            `CAST(${sql} AT TIME ZONE '${tz}' AS timestamp)`,
        toUTC: (sql, tz) =>
            `CAST(with_timezone(${sql}, '${tz}') AT TIME ZONE 'UTC' AS timestamp)`,
    },
    // Relabel to UTC so the wire value is the real instant. toDateTime lifts
    // Date truncs (month/year/etc.) into DateTime; no-op for DateTime inputs.
    [SupportedDbtAdapter.CLICKHOUSE]: {
        toProjectTz: (sql, tz) => `toTimeZone(${sql}, '${tz}')`,
        toUTC: (sql, tz) => `toTimeZone(toDateTime(${sql}, '${tz}'), 'UTC')`,
    },
};

// EXTRACT returns a number/string, so no `toUTC` inverse — one-way shift only.
type DateExtractTimezoneConversion = {
    toExtractInputTz: (sql: string, tz: string) => string;
};

export const dateExtractsTimezoneConversions: Record<
    SupportedDbtAdapter,
    DateExtractTimezoneConversion
> = {
    // `AT TIME ZONE` parses only inside `EXTRACT(... FROM ...)` and requires
    // TIMESTAMP, so coerce DATETIME-shaped inputs.
    [SupportedDbtAdapter.BIGQUERY]: {
        toExtractInputTz: (sql, tz) => `TIMESTAMP(${sql}) AT TIME ZONE '${tz}'`,
    },
    [SupportedDbtAdapter.SNOWFLAKE]: {
        toExtractInputTz: (sql, tz) =>
            `CONVERT_TIMEZONE('UTC', '${tz}', ${sql})`,
    },
    [SupportedDbtAdapter.POSTGRES]: {
        toExtractInputTz: (sql, tz) =>
            `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
    },
    [SupportedDbtAdapter.REDSHIFT]: {
        toExtractInputTz: (sql, tz) =>
            `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
    },
    [SupportedDbtAdapter.DUCKDB]: {
        toExtractInputTz: (sql, tz) =>
            `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
    },
    [SupportedDbtAdapter.DATABRICKS]: {
        toExtractInputTz: (sql, tz) =>
            `from_utc_timestamp(to_utc_timestamp(${sql}, current_timezone()), '${tz}')`,
    },
    [SupportedDbtAdapter.TRINO]: {
        toExtractInputTz: (sql, tz) =>
            `CAST(${sql} AT TIME ZONE '${tz}' AS timestamp)`,
    },
    [SupportedDbtAdapter.ATHENA]: {
        toExtractInputTz: (sql, tz) =>
            `CAST(${sql} AT TIME ZONE '${tz}' AS timestamp)`,
    },
    [SupportedDbtAdapter.CLICKHOUSE]: {
        toExtractInputTz: (sql, tz) => `toTimeZone(${sql}, '${tz}')`,
    },
};

export const SUB_DAY_TIME_FRAMES: ReadonlySet<TimeFrames> = new Set([
    TimeFrames.MILLISECOND,
    TimeFrames.SECOND,
    TimeFrames.MINUTE,
    TimeFrames.HOUR,
]);

export const isSubDayTimeFrame = (tf: TimeFrames): boolean =>
    SUB_DAY_TIME_FRAMES.has(tf);

const bigqueryStartOfWeekMap: Record<WeekDay, string> = {
    [WeekDay.MONDAY]: 'MONDAY',
    [WeekDay.TUESDAY]: 'TUESDAY',
    [WeekDay.WEDNESDAY]: 'WEDNESDAY',
    [WeekDay.THURSDAY]: 'THURSDAY',
    [WeekDay.FRIDAY]: 'FRIDAY',
    [WeekDay.SATURDAY]: 'SATURDAY',
    [WeekDay.SUNDAY]: 'SUNDAY',
};

const bigqueryConfig: WarehouseConfig = {
    // BigQuery: TIMESTAMP_TRUNC(ts, part, tz) truncates in the given zone and
    // returns a TIMESTAMP (real UTC instant). We intentionally do NOT wrap
    // with DATETIME(..., tz) — that would strip the zone back to a naive
    // wall-clock and mis-label it as UTC downstream.
    getSqlForTruncatedDate: (
        timeFrame,
        originalSql,
        type,
        startOfWeek,
        timezone,
    ) => {
        const datePart =
            timeFrame === TimeFrames.WEEK && isWeekDay(startOfWeek)
                ? `${timeFrame}(${bigqueryStartOfWeekMap[startOfWeek]})`
                : timeFrame;
        if (type === DimensionType.TIMESTAMP) {
            if (timezone) {
                // 3-arg overload requires TIMESTAMP; coerce in case the
                // declared TIMESTAMP dim emits DATETIME at runtime.
                return `TIMESTAMP_TRUNC(TIMESTAMP(${originalSql}), ${datePart}, '${timezone}')`;
            }
            return `TIMESTAMP_TRUNC(${originalSql}, ${datePart})`;
        }
        return `DATE_TRUNC(${originalSql}, ${datePart})`;
    },
    getSqlForDatePart: (
        timeFrame: TimeFrames,
        originalSql: string,
        _,
        startOfWeek,
    ) => {
        const bigqueryTimeFrameExpressions: Record<TimeFrames, string | null> =
            {
                ...timeFrameToDatePartMap,
                [TimeFrames.DAY_OF_WEEK_INDEX]: 'DAYOFWEEK',
                [TimeFrames.DAY_OF_YEAR_NUM]: 'DAYOFYEAR',
            };
        const datePart = bigqueryTimeFrameExpressions[timeFrame];

        if (!datePart) {
            throw new ParseError(`Cannot recognise date part for ${timeFrame}`);
        }

        if (timeFrame === TimeFrames.WEEK_NUM && isWeekDay(startOfWeek)) {
            return `EXTRACT(${datePart}(${bigqueryStartOfWeekMap[startOfWeek]}) FROM ${originalSql})`;
        }

        // BigQuery DAYOFWEEK: 1=Sunday, 2=Monday, ..., 7=Saturday
        if (
            timeFrame === TimeFrames.DAY_OF_WEEK_INDEX &&
            isWeekDay(startOfWeek)
        ) {
            const nativeOffset = ((startOfWeek + 1) % 7) + 1;
            return `MOD(EXTRACT(DAYOFWEEK FROM ${originalSql}) - ${nativeOffset} + 7, 7) + 1`;
        }

        return `EXTRACT(${datePart} FROM ${originalSql})`;
    },
    getSqlForDatePartName: (
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
        timezone,
    ) => {
        // https://cloud.google.com/bigquery/docs/reference/standard-sql/format-elements#format_elements_date_time
        const timeFrameExpressions: Record<TimeFrames, string | null> = {
            ...nullTimeFrameMap,
            [TimeFrames.DAY_OF_WEEK_NAME]: '%A',
            [TimeFrames.MONTH_NAME]: '%B',
            [TimeFrames.QUARTER_NAME]: 'Q%Q',
        };
        const formatExpression = timeFrameExpressions[timeFrame];
        if (!formatExpression) {
            throw new ParseError(
                `Cannot recognise format expression for ${timeFrame}`,
            );
        }
        if (type === DimensionType.TIMESTAMP) {
            if (timezone) {
                // FORMAT_TIMESTAMP requires TIMESTAMP; coerce DATETIME-shaped inputs.
                return `FORMAT_TIMESTAMP('${formatExpression}', TIMESTAMP(${originalSql}), '${timezone}')`;
            }
            return `FORMAT_DATETIME('${formatExpression}', ${originalSql})`;
        }
        return `FORMAT_DATE('${formatExpression}', ${originalSql})`;
    },
};

// Snowflake handles start of week by setting a session variable (WEEK_START)
const snowflakeConfig: WarehouseConfig = {
    getSqlForTruncatedDate: (timeFrame, originalSql) =>
        `DATE_TRUNC('${timeFrame}', ${originalSql})`,
    getSqlForDatePart: (timeFrame: TimeFrames, originalSql: string) => {
        const datePart = timeFrameToDatePartMap[timeFrame];

        if (!datePart) {
            throw new ParseError(`Cannot recognise date part for ${timeFrame}`);
        }

        return `DATE_PART('${datePart}', ${originalSql})`;
    },
    getSqlForDatePartName: (
        timeFrame: TimeFrames,
        originalSql: string,
        _type,
        timezone,
    ) => {
        const sql = timezone
            ? dateExtractsTimezoneConversions[
                  SupportedDbtAdapter.SNOWFLAKE
              ].toExtractInputTz(originalSql, timezone)
            : originalSql;
        // https://docs.snowflake.com/en/sql-reference/functions/to_char.html
        const timeFrameExpressionsFn: Record<
            TimeFrames,
            (() => string) | null
        > = {
            ...nullTimeFrameMap,
            [TimeFrames.DAY_OF_WEEK_NAME]: () =>
                `DECODE(TO_CHAR(${sql}, 'DY'), 'Mon', 'Monday', 'Tue', 'Tuesday', 'Wed', 'Wednesday', 'Thu', 'Thursday', 'Fri', 'Friday', 'Sat', 'Saturday', 'Sun', 'Sunday')`,
            [TimeFrames.MONTH_NAME]: () => `TO_CHAR(${sql}, 'MMMM')`,
            [TimeFrames.QUARTER_NAME]: () =>
                `CONCAT('Q', DATE_PART('QUARTER', ${sql}))`,
        };
        const formatExpressionFn = timeFrameExpressionsFn[timeFrame];
        if (!formatExpressionFn) {
            throw new ParseError(
                `Cannot recognise format expression for ${timeFrame}`,
            );
        }
        return formatExpressionFn();
    },
};

const postgresConfig: WarehouseConfig = {
    getSqlForTruncatedDate: (timeFrame, originalSql, _, startOfWeek) => {
        if (timeFrame === TimeFrames.WEEK && isWeekDay(startOfWeek)) {
            const intervalDiff = `${startOfWeek} days`;
            return `(DATE_TRUNC('${timeFrame}', (${originalSql} - interval '${intervalDiff}')) + interval '${intervalDiff}')`;
        }
        return `DATE_TRUNC('${timeFrame}', ${originalSql})`;
    },
    getSqlForDatePart: (
        timeFrame: TimeFrames,
        originalSql: string,
        _,
        startOfWeek,
    ) => {
        const datePart = timeFrameToDatePartMap[timeFrame];

        if (!datePart) {
            throw new ParseError(`Cannot recognise date part for ${timeFrame}`);
        }

        if (timeFrame === TimeFrames.WEEK_NUM && isWeekDay(startOfWeek)) {
            const intervalDiff = `${startOfWeek} days`;
            return `DATE_PART('${datePart}', (${originalSql} - interval '${intervalDiff}'))`;
        }

        // PostgreSQL DOW: 0=Sunday, 1=Monday, ..., 6=Saturday
        if (
            timeFrame === TimeFrames.DAY_OF_WEEK_INDEX &&
            isWeekDay(startOfWeek)
        ) {
            const nativeOffset = (startOfWeek + 1) % 7;
            return `MOD(CAST(DATE_PART('DOW', ${originalSql}) AS INT) - ${nativeOffset} + 7, 7) + 1`;
        }

        return `DATE_PART('${datePart}', ${originalSql})`;
    },
    getSqlForDatePartName: (
        timeFrame: TimeFrames,
        originalSql: string,
        _type,
        timezone,
    ) => {
        const sql = timezone
            ? dateExtractsTimezoneConversions[
                  SupportedDbtAdapter.POSTGRES
              ].toExtractInputTz(originalSql, timezone)
            : originalSql;
        // https://www.postgresql.org/docs/current/functions-formatting.html
        const timeFrameExpressions: Record<TimeFrames, string | null> = {
            ...nullTimeFrameMap,
            [TimeFrames.DAY_OF_WEEK_NAME]: 'Day',
            [TimeFrames.MONTH_NAME]: 'Month',
            [TimeFrames.QUARTER_NAME]: '"Q"Q',
        };
        const formatExpression = timeFrameExpressions[timeFrame];
        if (!formatExpression) {
            throw new ParseError(
                `Cannot recognise format expression for ${timeFrame}`,
            );
        }
        return `TO_CHAR(${sql}, 'FM${formatExpression}')`;
    },
};

const databricksConfig: WarehouseConfig = {
    getSqlForTruncatedDate: (timeFrame, originalSql, _, startOfWeek) => {
        if (timeFrame === TimeFrames.WEEK && isWeekDay(startOfWeek)) {
            const intervalDiff = `${startOfWeek}`;
            return `DATEADD(DAY, ${intervalDiff}, DATE_TRUNC('${timeFrame}', DATEADD(DAY, -${intervalDiff}, ${originalSql})))`;
        }
        return `DATE_TRUNC('${timeFrame}', ${originalSql})`;
    },
    getSqlForDatePart: (
        timeFrame: TimeFrames,
        originalSql: string,
        _,
        startOfWeek,
    ) => {
        const datePart = timeFrameToDatePartMap[timeFrame];

        if (!datePart) {
            throw new ParseError(`Cannot recognise date part for ${timeFrame}`);
        }

        if (timeFrame === TimeFrames.WEEK_NUM && isWeekDay(startOfWeek)) {
            const intervalDiff = `${startOfWeek} days`;
            return `DATE_PART('${datePart}', (${originalSql} - interval '${intervalDiff}'))`;
        }

        // Databricks DOW: 0=Sunday, 1=Monday, ..., 6=Saturday
        if (
            timeFrame === TimeFrames.DAY_OF_WEEK_INDEX &&
            isWeekDay(startOfWeek)
        ) {
            const nativeOffset = (startOfWeek + 1) % 7;
            return `MOD(CAST(DATE_PART('DOW', ${originalSql}) AS INT) - ${nativeOffset} + 7, 7) + 1`;
        }

        return `DATE_PART('${datePart}', ${originalSql})`;
    },
    getSqlForDatePartName: (
        timeFrame: TimeFrames,
        originalSql: string,
        _type,
        timezone,
    ) => {
        const sql = timezone
            ? dateExtractsTimezoneConversions[
                  SupportedDbtAdapter.DATABRICKS
              ].toExtractInputTz(originalSql, timezone)
            : originalSql;
        // https://docs.databricks.com/spark/latest/spark-sql/language-manual/functions/date_format.html
        const timeFrameExpressions: Record<TimeFrames, string | null> = {
            ...nullTimeFrameMap,
            [TimeFrames.DAY_OF_WEEK_NAME]: 'EEEE',
            [TimeFrames.MONTH_NAME]: 'MMMM',
            [TimeFrames.QUARTER_NAME]: 'QQQ',
        };
        const formatExpression = timeFrameExpressions[timeFrame];
        if (!formatExpression) {
            throw new ParseError(
                `Cannot recognise format expression for ${timeFrame}`,
            );
        }
        return `DATE_FORMAT(${sql}, '${formatExpression}')`;
    },
};

const trinoConfig: WarehouseConfig = {
    // Trino rejects sub-day DATE_TRUNC on DATE columns ('SECOND' is not a
    // valid DATE field). Cast to TIMESTAMP for sub-day grains; no-op when the
    // input is already a TIMESTAMP.
    getSqlForTruncatedDate: (timeFrame, originalSql, _, startOfWeek) => {
        const sql = isSubDayTimeFrame(timeFrame)
            ? `CAST(${originalSql} AS TIMESTAMP)`
            : originalSql;
        if (timeFrame === TimeFrames.WEEK && isWeekDay(startOfWeek)) {
            const intervalDiff = `'${startOfWeek}' day`;
            return `(DATE_TRUNC('${timeFrame}', (${sql} - interval ${intervalDiff})) + interval ${intervalDiff})`;
        }
        return `DATE_TRUNC('${timeFrame}', ${sql})`;
    },
    getSqlForDatePart: (
        timeFrame: TimeFrames,
        originalSql: string,
        _,
        startOfWeek,
    ) => {
        const datePart = timeFrameToDatePartMap[timeFrame];
        if (!datePart) {
            throw new ParseError(`Cannot recognise date part for ${timeFrame}`);
        }

        if (timeFrame === TimeFrames.WEEK_NUM && isWeekDay(startOfWeek)) {
            const intervalDiff = `'${startOfWeek}' day`;
            return `EXTRACT(${datePart} FROM (${originalSql} - interval ${intervalDiff}))`;
        }

        // Trino DOW (ISO): 1=Monday, 2=Tuesday, ..., 7=Sunday
        if (
            timeFrame === TimeFrames.DAY_OF_WEEK_INDEX &&
            isWeekDay(startOfWeek)
        ) {
            const nativeOffset = startOfWeek + 1;
            return `MOD(EXTRACT(DOW FROM ${originalSql}) - ${nativeOffset} + 7, 7) + 1`;
        }

        return `EXTRACT(${datePart} FROM ${originalSql})`;
    },
    getSqlForDatePartName: (
        timeFrame: TimeFrames,
        originalSql: string,
        _type,
        timezone,
    ) => {
        const sql = timezone
            ? dateExtractsTimezoneConversions[
                  SupportedDbtAdapter.TRINO
              ].toExtractInputTz(originalSql, timezone)
            : originalSql;
        const timeFrameExpressionsFn: Record<
            TimeFrames,
            (() => string) | null
        > = {
            ...nullTimeFrameMap,
            [TimeFrames.DAY_OF_WEEK_NAME]: () => `date_format(${sql}, '%W')`,
            [TimeFrames.MONTH_NAME]: () => `date_format(${sql}, '%M')`,
            [TimeFrames.QUARTER_NAME]: () =>
                `CONCAT('Q', cast(extract(QUARTER from ${sql}) as varchar))`,
        };
        const formatExpressionFn = timeFrameExpressionsFn[timeFrame];
        if (!formatExpressionFn) {
            throw new ParseError(
                `Cannot recognise format expression for ${timeFrame}`,
            );
        }
        return formatExpressionFn();
    },
};

const clickhouseConfig: WarehouseConfig = {
    getSqlForTruncatedDate: (timeFrame, originalSql, _, startOfWeek) => {
        if (timeFrame === TimeFrames.WEEK && isWeekDay(startOfWeek)) {
            const intervalDiff = startOfWeek;
            // Mode 1 makes toStartOfWeek() return Monday (matching Postgres DATE_TRUNC('week')),
            // so the shift arithmetic is correct for all startOfWeek values.
            return `addDays(toStartOfWeek(addDays(${originalSql}, -${intervalDiff}), 1), ${intervalDiff})`;
        }

        switch (timeFrame) {
            case TimeFrames.DAY:
                return `toStartOfDay(${originalSql})`;
            case TimeFrames.WEEK:
                return `toStartOfWeek(${originalSql})`;
            case TimeFrames.MONTH:
                return `toStartOfMonth(${originalSql})`;
            case TimeFrames.QUARTER:
                return `toStartOfQuarter(${originalSql})`;
            case TimeFrames.YEAR:
                return `toStartOfYear(${originalSql})`;
            case TimeFrames.HOUR:
                return `toStartOfHour(${originalSql})`;
            case TimeFrames.MINUTE:
                return `toStartOfMinute(${originalSql})`;
            case TimeFrames.SECOND:
                // toStartOfSecond requires DateTime64; lift Date/DateTime via cast.
                return `toStartOfSecond(toDateTime64(${originalSql}, 3))`;
            case TimeFrames.MILLISECOND:
                return `toStartOfMillisecond(toDateTime64(${originalSql}, 3))`;
            default:
                throw new ParseError(
                    `Cannot recognise truncate function for ${timeFrame}`,
                );
        }
    },
    getSqlForDatePart: (
        timeFrame: TimeFrames,
        originalSql: string,
        _,
        startOfWeek,
    ) => {
        const clickhouseTimeFrameMap: Record<TimeFrames, string | null> = {
            ...timeFrameToDatePartMap,
            [TimeFrames.DAY_OF_WEEK_INDEX]: 'toDayOfWeek',
            [TimeFrames.DAY_OF_MONTH_NUM]: 'toDayOfMonth',
            [TimeFrames.DAY_OF_YEAR_NUM]: 'toDayOfYear',
            [TimeFrames.WEEK_NUM]: 'toWeek',
            [TimeFrames.MONTH_NUM]: 'toMonth',
            [TimeFrames.QUARTER_NUM]: 'toQuarter',
            [TimeFrames.YEAR_NUM]: 'toYear',
            [TimeFrames.HOUR_OF_DAY_NUM]: 'toHour',
            [TimeFrames.MINUTE_OF_HOUR_NUM]: 'toMinute',
        };

        // ClickHouse toDayOfWeek (ISO): 1=Monday, 2=Tuesday, ..., 7=Sunday
        if (
            timeFrame === TimeFrames.DAY_OF_WEEK_INDEX &&
            isWeekDay(startOfWeek)
        ) {
            const nativeOffset = startOfWeek + 1;
            return `modulo(toDayOfWeek(${originalSql}) - ${nativeOffset} + 7, 7) + 1`;
        }

        // ClickHouse toWeek defaults to mode 0 (US, Sunday-base, 0–53). Mode 3 is
        // ISO 8601 (Monday-base, 1–53), matching Postgres EXTRACT(WEEK) and the
        // toStartOfWeek(d, 1) used by truncation. The startOfWeek shift mirrors
        // what other warehouses do on the same path.
        if (timeFrame === TimeFrames.WEEK_NUM && isWeekDay(startOfWeek)) {
            return `toWeek(addDays(${originalSql}, -${startOfWeek}), 3)`;
        }

        const extractFunction = clickhouseTimeFrameMap[timeFrame];
        if (!extractFunction) {
            throw new ParseError(
                `Cannot recognise extract function for ${timeFrame}`,
            );
        }
        return `${extractFunction}(${originalSql})`;
    },
    getSqlForDatePartName: (
        timeFrame: TimeFrames,
        originalSql: string,
        _type,
        timezone,
    ) => {
        const sql = timezone
            ? dateExtractsTimezoneConversions[
                  SupportedDbtAdapter.CLICKHOUSE
              ].toExtractInputTz(originalSql, timezone)
            : originalSql;
        const timeFrameExpressions: Record<TimeFrames, string | null> = {
            ...nullTimeFrameMap,
            [TimeFrames.DAY_OF_WEEK_NAME]: `dateName('weekday', ${sql})`,
            [TimeFrames.MONTH_NAME]: `monthName(${sql})`,
            [TimeFrames.QUARTER_NAME]: `concat('Q', toString(toQuarter(${sql})))`,
        };
        const formatExpression = timeFrameExpressions[timeFrame];
        if (!formatExpression) {
            throw new ParseError(
                `Cannot recognise format expression for ${timeFrame}`,
            );
        }
        return formatExpression;
    },
};

const warehouseConfigs: Record<SupportedDbtAdapter, WarehouseConfig> = {
    [SupportedDbtAdapter.BIGQUERY]: bigqueryConfig,
    [SupportedDbtAdapter.SNOWFLAKE]: snowflakeConfig,
    [SupportedDbtAdapter.REDSHIFT]: postgresConfig,
    [SupportedDbtAdapter.POSTGRES]: postgresConfig,
    [SupportedDbtAdapter.DUCKDB]: postgresConfig,
    [SupportedDbtAdapter.DATABRICKS]: databricksConfig,
    [SupportedDbtAdapter.TRINO]: trinoConfig,
    [SupportedDbtAdapter.ATHENA]: trinoConfig, // Athena uses Trino SQL dialect
    [SupportedDbtAdapter.CLICKHOUSE]: clickhouseConfig,
};

/**
 * Generates DATE_TRUNC SQL. When a timezone is provided, the truncation is
 * performed in the project TZ and the result is converted back to a proper
 * UTC instant so downstream consumers apply .tz(project_tz) uniformly.
 */
export const getSqlForTruncatedDate = (
    adapterType: SupportedDbtAdapter,
    timeFrame: TimeFrames,
    originalSql: string,
    type: DimensionType,
    startOfWeek?: WeekDay | null,
    timezone?: string,
): string => {
    if (!timezone || type !== DimensionType.TIMESTAMP) {
        return warehouseConfigs[adapterType].getSqlForTruncatedDate(
            timeFrame,
            originalSql,
            type,
            startOfWeek,
        );
    }

    const { toProjectTz, toUTC } = dateTruncTimezoneConversions[adapterType];
    const input = toProjectTz(originalSql, timezone);
    const truncated = warehouseConfigs[adapterType].getSqlForTruncatedDate(
        timeFrame,
        input,
        type,
        startOfWeek,
        timezone,
    );
    return toUTC(truncated, timezone);
};

// DATE base dimensions short-circuit: no time component to shift.
export const getSqlForDatePart = (
    adapterType: SupportedDbtAdapter,
    timeFrame: TimeFrames,
    originalSql: string,
    type: DimensionType,
    startOfWeek?: WeekDay | null,
    timezone?: string,
): string => {
    const wrappedSql =
        timezone && type === DimensionType.TIMESTAMP
            ? dateExtractsTimezoneConversions[adapterType].toExtractInputTz(
                  originalSql,
                  timezone,
              )
            : originalSql;
    return warehouseConfigs[adapterType].getSqlForDatePart(
        timeFrame,
        wrappedSql,
        type,
        startOfWeek,
    );
};

// Unlike getSqlForDatePart, the wrap is applied per-adapter rather than
// centrally — BigQuery's name path uses native FORMAT_TIMESTAMP(fmt, ts, tz)
// and can't accept a pre-wrapped `... AT TIME ZONE` input.
export const getSqlForDatePartName = (
    adapterType: SupportedDbtAdapter,
    timeFrame: TimeFrames,
    originalSql: string,
    type: DimensionType,
    _startOfWeek?: WeekDay | null,
    timezone?: string,
): string => {
    if (!timezone || type !== DimensionType.TIMESTAMP) {
        return warehouseConfigs[adapterType].getSqlForDatePartName(
            timeFrame,
            originalSql,
            type,
        );
    }
    return warehouseConfigs[adapterType].getSqlForDatePartName(
        timeFrame,
        originalSql,
        type,
        timezone,
    );
};

type TimeFrameConfig = {
    getLabel: () => string;
    getDimensionType: (fallback: DimensionType) => DimensionType;
    getSql: (
        adapterType: SupportedDbtAdapter,
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
        startOfWeek?: WeekDay | null,
        timezone?: string,
    ) => string;
    getAxisMinInterval: () => number | null;
    getAxisLabelFormatter: () => Record<string, string> | null;
};

export const timeFrameConfigs: Record<TimeFrames, TimeFrameConfig> = {
    RAW: {
        getLabel: () => 'Raw',
        getDimensionType: (fallback) => fallback,
        getSql: (_adapterType, _timeInterval, originalSql) => originalSql,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    MILLISECOND: {
        getLabel: () => 'Millisecond',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: getSqlForTruncatedDate,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    SECOND: {
        getLabel: () => 'Second',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: getSqlForTruncatedDate,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    MINUTE: {
        getLabel: () => 'Minute',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: getSqlForTruncatedDate,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    HOUR: {
        getLabel: () => 'Hour',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: getSqlForTruncatedDate,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    DAY: {
        getLabel: () => 'Day',
        getDimensionType: () => DimensionType.DATE,
        getSql: getSqlForTruncatedDate,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => ({
            year: '{bold|{yyyy}}',
            month: '{bold|{MMM}}',
            day: '{d}',
            hour: '',
        }),
    },
    WEEK: {
        getLabel: () => 'Week',
        getDimensionType: () => DimensionType.DATE,
        getSql: getSqlForTruncatedDate,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    MONTH: {
        getLabel: () => 'Month',
        getDimensionType: () => DimensionType.DATE,
        getSql: getSqlForTruncatedDate,
        getAxisMinInterval: () => 2629800000,
        getAxisLabelFormatter: () => null,
    },
    QUARTER: {
        getLabel: () => 'Quarter',
        getDimensionType: () => DimensionType.DATE,
        getSql: getSqlForTruncatedDate,
        getAxisMinInterval: () => 7889400000,
        getAxisLabelFormatter: () => null,
    },
    YEAR: {
        getLabel: () => 'Year',
        getDimensionType: () => DimensionType.DATE,
        getSql: getSqlForTruncatedDate,
        getAxisMinInterval: () => 31557600000,
        getAxisLabelFormatter: () => null,
    },
    WEEK_NUM: {
        getLabel: () => 'Week (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    MONTH_NUM: {
        getLabel: () => 'Month (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    DAY_OF_WEEK_INDEX: {
        getLabel: () => 'Day of the week (index)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    DAY_OF_MONTH_NUM: {
        getLabel: () => 'Day of the month (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    DAY_OF_YEAR_NUM: {
        getLabel: () => 'Day of the year (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    QUARTER_NUM: {
        getLabel: () => 'Quarter (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    YEAR_NUM: {
        getLabel: () => 'Year (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    DAY_OF_WEEK_NAME: {
        getLabel: () => 'Day of the week (name)',
        getDimensionType: () => DimensionType.STRING,
        getSql: getSqlForDatePartName,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    MONTH_NAME: {
        getLabel: () => 'Month (name)',
        getDimensionType: () => DimensionType.STRING,
        getSql: getSqlForDatePartName,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    QUARTER_NAME: {
        getLabel: () => 'Quarter (name)',
        getDimensionType: () => DimensionType.STRING,
        getSql: getSqlForDatePartName,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    HOUR_OF_DAY_NUM: {
        getLabel: () => 'Hour of day (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
    MINUTE_OF_HOUR_NUM: {
        getLabel: () => 'Minute of hour (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
        getAxisMinInterval: () => null,
        getAxisLabelFormatter: () => null,
    },
};

export const getDefaultTimeFrames = (type: DimensionType) =>
    type === DimensionType.TIMESTAMP
        ? [
              TimeFrames.RAW,
              TimeFrames.DAY,
              TimeFrames.WEEK,
              TimeFrames.MONTH,
              TimeFrames.QUARTER,
              TimeFrames.YEAR,
          ]
        : [
              TimeFrames.DAY,
              TimeFrames.WEEK,
              TimeFrames.MONTH,
              TimeFrames.QUARTER,
              TimeFrames.YEAR,
          ];

/** Time frames that use DATE_TRUNC (not EXTRACT/DATE_PART). */
export const truncatableTimeFrames: ReadonlySet<TimeFrames> = new Set([
    TimeFrames.MILLISECOND,
    TimeFrames.SECOND,
    TimeFrames.MINUTE,
    TimeFrames.HOUR,
    TimeFrames.DAY,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
]);

/** Time frames that use EXTRACT/DATE_PART or format/name functions, not DATE_TRUNC. */
export const extractableTimeFrames: ReadonlySet<TimeFrames> = new Set([
    TimeFrames.DAY_OF_WEEK_INDEX,
    TimeFrames.DAY_OF_MONTH_NUM,
    TimeFrames.DAY_OF_YEAR_NUM,
    TimeFrames.WEEK_NUM,
    TimeFrames.MONTH_NUM,
    TimeFrames.QUARTER_NUM,
    TimeFrames.YEAR_NUM,
    TimeFrames.HOUR_OF_DAY_NUM,
    TimeFrames.MINUTE_OF_HOUR_NUM,
    TimeFrames.DAY_OF_WEEK_NAME,
    TimeFrames.MONTH_NAME,
    TimeFrames.QUARTER_NAME,
]);

export const isTimeInterval = (value: string): value is TimeFrames =>
    Object.keys(timeFrameConfigs).includes(value);

export const validateTimeFrames = (values: string[]): TimeFrames[] =>
    values.reduce<TimeFrames[]>((acc, value) => {
        const uppercaseValue = value.toUpperCase();
        return isTimeInterval(uppercaseValue) ? [...acc, uppercaseValue] : acc;
    }, []);

export const timeFrameOrder = [
    undefined,
    TimeFrames.RAW,
    TimeFrames.MILLISECOND,
    TimeFrames.SECOND,
    TimeFrames.MINUTE,
    TimeFrames.HOUR,
    TimeFrames.DAY,
    TimeFrames.DAY_OF_WEEK_INDEX,
    TimeFrames.DAY_OF_WEEK_NAME,
    TimeFrames.DAY_OF_MONTH_NUM,
    TimeFrames.DAY_OF_YEAR_NUM,
    TimeFrames.WEEK,
    TimeFrames.WEEK_NUM,
    TimeFrames.MONTH,
    TimeFrames.MONTH_NUM,
    TimeFrames.MONTH_NAME,
    TimeFrames.QUARTER,
    TimeFrames.QUARTER_NUM,
    TimeFrames.QUARTER_NAME,
    TimeFrames.YEAR,
    TimeFrames.YEAR_NUM,
    TimeFrames.HOUR_OF_DAY_NUM,
    TimeFrames.MINUTE_OF_HOUR_NUM,
];

export const sortTimeFrames = (a: TimeFrames, b: TimeFrames) =>
    timeFrameOrder.indexOf(a) - timeFrameOrder.indexOf(b);

export const SUB_DAY_GRANULARITIES: ReadonlySet<string> = new Set<string>([
    DateGranularity.SECOND,
    DateGranularity.MINUTE,
    DateGranularity.HOUR,
]);

export const isSubDayGranularity = (g: string): boolean =>
    SUB_DAY_GRANULARITIES.has(g);

export const getDateDimension = (dimensionId: string) => {
    const timeFrames = Object.values(DateGranularity).map((tf) =>
        tf.toLowerCase(),
    );
    const isDate = timeFrames.some((timeFrame) =>
        dimensionId.endsWith(timeFrame),
    );

    if (isDate) {
        const regex = new RegExp(`_(${timeFrames.join('|')})$`);

        const baseDimensionId = dimensionId.replace(regex, '');

        const timeString = dimensionId.replace(`${baseDimensionId}_`, '');
        const [newTimeFrame] = validateTimeFrames([timeString]);

        if (baseDimensionId && newTimeFrame)
            return {
                baseDimensionId,
                newTimeFrame,
            };
    }

    return {};
};
