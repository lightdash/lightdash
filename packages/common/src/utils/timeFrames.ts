import { SupportedDbtAdapter } from '../types/dbt';
import { ParseError } from '../types/errors';
import { DimensionType, type TimestampDomain } from '../types/field';
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
    // GLITCH-628: day-or-coarser truncation that returns a DATE directly.
    // Overridden where the generic `CAST(getSqlForTruncatedDate(...) AS DATE)`
    // defeats partition pruning (BigQuery only prunes whitelisted functions
    // applied directly to the partition column).
    getSqlForTruncatedDateAsDate?: (
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
        startOfWeek?: WeekDay | null,
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
        sourceTimezone?: string,
        timestampDomain?: TimestampDomain,
    ) => string;
};

/** Per-warehouse SQL for the DATE_TRUNC timezone round-trip. `toProjectTz`
 *  shifts into project-local wall-clock before truncation; `toUTC` converts
 *  the truncated value back into a proper UTC instant. `castAsDate` casts a
 *  truncated wall-clock value to a real DATE (GLITCH-452) — every adapter's
 *  wrapped path truncates a naive project-local wall-clock, so `CAST(x AS DATE)`
 *  reads the right date. `sourceTimezone` is the timezone the
 *  column is in — only Snowflake uses it explicitly (in `CONVERT_TIMEZONE`);
 *  other adapters ignore it.
 *
 *  `castToInstant` rebases a naive timestamp into a true instant via the
 *  warehouse session timezone; identity in value for aware columns. It is the
 *  inner term of `toProjectTz`, composed below so the two cannot drift.
 *
 *  `castNaiveToInstant` is the explicit, session-independent version for a
 *  known-naive column: rebase the stored wall clock from its data timezone
 *  `z` into an instant. Null where the domain-directed path never fires
 *  (Snowflake's compile-time wrap + session already handle NTZ; ClickHouse
 *  has no naive columns). `toProjectTzFromInstant` is the outer term of
 *  `toProjectTz` — it accepts an already-instant input so the naive rebase
 *  can replace the inner `castToInstant` without double-wrapping. */
type DateTruncTimezoneConversion = {
    toProjectTz: (sql: string, tz: string, sourceTimezone?: string) => string;
    toProjectTzFromInstant: (instantSql: string, tz: string) => string;
    toUTC: (sql: string, tz: string) => string;
    castAsDate: (sql: string, tz: string) => string;
    castToInstant: (sql: string) => string;
    castNaiveToInstant: ((sql: string, z: string) => string) | null;
    /** Explicit naive rebase for aggregate OUTPUTS (MIN/MAX over a bare
     *  column). Equals `castNaiveToInstant` except on Snowflake, whose dim
     *  path is compile-time wrapped (so `castNaiveToInstant` stays null until
     *  the wrap is retired) while its aggregates see the bare column and can
     *  rebase explicitly. Null only where no naive columns exist. */
    castNaiveAggregateToInstant: ((sql: string, z: string) => string) | null;
    /** Explicit session-proof instant for a KNOWN-AWARE column. Non-null only
     *  on adapters whose bare aware outputs depend on the session timezone
     *  (Databricks/Spark); everywhere else the bare column is already an
     *  instant on the wire. */
    castAwareToInstant: ((sql: string) => string) | null;
    /** Applied to the final sub-day output of the explicit truncation path so
     *  the wire value stops depending on the session timezone. Non-null only
     *  on Databricks/Spark (TIMESTAMP_NTZ freeze); day-or-coarser grains exit
     *  via castAsDate, which is already session-proof. */
    freezeInstantOutput: ((sql: string) => string) | null;
};

const bigqueryCastToInstant = (sql: string) => `TIMESTAMP(${sql})`;
const postgresLikeCastToInstant = (sql: string) => `(${sql})::timestamptz`;
// ClickHouse DateTime values are instants; session_timezone only changes how
// they serialize. Pinning to UTC keeps the wire value a parseable instant.
const clickhouseCastToInstant = (sql: string) => `toTimeZone(${sql}, 'UTC')`;
const identityCastToInstant = (sql: string) => sql;

// Adapters whose castToInstant genuinely rebases a naive column at the SQL
// level. Identity adapters keep filter columns bare; ClickHouse has no naive
// type (its castToInstant only relabels an instant) so its filters stay bare.
export const naiveTimestampRebaseAdapters: ReadonlySet<SupportedDbtAdapter> =
    new Set([
        SupportedDbtAdapter.BIGQUERY,
        SupportedDbtAdapter.POSTGRES,
        SupportedDbtAdapter.REDSHIFT,
        SupportedDbtAdapter.DUCKDB,
    ]);

const bigqueryCastNaiveToInstant = (sql: string, z: string) =>
    `TIMESTAMP(${sql}, '${z}')`;
// 3-arg CONVERT_TIMEZONE reads the NTZ wall clock in z and returns the UTC
// face as TIMESTAMP_NTZ — session-independent, NTZ-input only (safe because
// it is applied exclusively to known-naive bases).
const snowflakeCastNaiveToInstant = (sql: string, z: string) =>
    `CONVERT_TIMEZONE('${z}', 'UTC', ${sql})`;
const postgresLikeCastNaiveToInstant = (sql: string, z: string) =>
    `((${sql}) AT TIME ZONE '${z}')`;
// Databricks/Spark render TIMESTAMP results through the session timezone, so
// every explicit-path exit to the wire freezes the face as TIMESTAMP_NTZ —
// the driver returns NTZ verbatim, making the result session-independent.
const databricksCastNaiveToInstant = (sql: string, z: string) =>
    `CAST(to_utc_timestamp(${sql}, '${z}') AS TIMESTAMP_NTZ)`;
// Known-aware column to a frozen UTC face: shift the session-rendered face to
// UTC (the two session dependencies cancel under any session).
const databricksCastAwareToInstant = (sql: string) =>
    `CAST(to_utc_timestamp(${sql}, current_timezone()) AS TIMESTAMP_NTZ)`;
const databricksFreezeInstantOutput = (sql: string) =>
    `CAST(${sql} AS TIMESTAMP_NTZ)`;
// Trino has no instant wire type Lightdash can parse (see toUTC comment
// below), so its "instant" form is a naive-UTC timestamp.
const trinoCastNaiveToInstant = (sql: string, z: string) =>
    `CAST(with_timezone(${sql}, '${z}') AT TIME ZONE 'UTC' AS timestamp)`;

const bigqueryToProjectTzFromInstant = (instantSql: string, tz: string) =>
    `DATETIME(${instantSql}, '${tz}')`;
const postgresLikeToProjectTzFromInstant = (instantSql: string, tz: string) =>
    `${instantSql} AT TIME ZONE '${tz}'`;
const databricksToProjectTzFromInstant = (instantSql: string, tz: string) =>
    `from_utc_timestamp(${instantSql}, '${tz}')`;
// Legacy wrap: a naive input is read in the session zone (the session crutch).
const trinoToProjectTz = (sql: string, tz: string) =>
    `CAST(${sql} AT TIME ZONE '${tz}' AS timestamp)`;
// Explicit variant for an already-instant (naive-UTC) input: re-attach UTC so
// the read stays correct regardless of the session zone.
const trinoToProjectTzFromInstant = (instantSql: string, tz: string) =>
    `CAST(with_timezone(${instantSql}, 'UTC') AT TIME ZONE '${tz}' AS timestamp)`;

export const dateTruncTimezoneConversions: Record<
    SupportedDbtAdapter,
    DateTruncTimezoneConversion
> = {
    // BigQuery: shift the UTC instant into a naive project-TZ DATETIME so the
    // DST fall-back fold collapses under DATETIME_TRUNC (merge), then re-attach
    // the zone to recover a real instant. Coerce via TIMESTAMP() first because a
    // declared-TIMESTAMP dim can emit DATETIME at runtime; DATETIME(timestamp,
    // tz) requires a TIMESTAMP left side.
    [SupportedDbtAdapter.BIGQUERY]: {
        toProjectTz: (sql, tz) =>
            bigqueryToProjectTzFromInstant(bigqueryCastToInstant(sql), tz),
        toProjectTzFromInstant: bigqueryToProjectTzFromInstant,
        toUTC: (sql, tz) => `TIMESTAMP(${sql}, '${tz}')`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: bigqueryCastToInstant,
        castNaiveToInstant: bigqueryCastNaiveToInstant,
        castNaiveAggregateToInstant: bigqueryCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    [SupportedDbtAdapter.SNOWFLAKE]: {
        toProjectTz: (sql, tz, sourceTimezone = 'UTC') =>
            `CONVERT_TIMEZONE('${sourceTimezone}', '${tz}', ${sql})`,
        toProjectTzFromInstant: (sql, tz) =>
            `CONVERT_TIMEZONE('UTC', '${tz}', ${sql})`,
        toUTC: (sql, tz) => `CONVERT_TIMEZONE('${tz}', 'UTC', ${sql})`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: identityCastToInstant,
        // Dim path stays on the compile-time wrap until the rescope retires it
        castNaiveToInstant: null,
        castNaiveAggregateToInstant: snowflakeCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    [SupportedDbtAdapter.POSTGRES]: {
        toProjectTz: (sql, tz) =>
            postgresLikeToProjectTzFromInstant(
                postgresLikeCastToInstant(sql),
                tz,
            ),
        toProjectTzFromInstant: postgresLikeToProjectTzFromInstant,
        toUTC: (sql, tz) => `(${sql}) AT TIME ZONE '${tz}'`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: postgresLikeCastToInstant,
        castNaiveToInstant: postgresLikeCastNaiveToInstant,
        castNaiveAggregateToInstant: postgresLikeCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    [SupportedDbtAdapter.REDSHIFT]: {
        toProjectTz: (sql, tz) =>
            postgresLikeToProjectTzFromInstant(
                postgresLikeCastToInstant(sql),
                tz,
            ),
        toProjectTzFromInstant: postgresLikeToProjectTzFromInstant,
        toUTC: (sql, tz) => `(${sql}) AT TIME ZONE '${tz}'`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: postgresLikeCastToInstant,
        castNaiveToInstant: postgresLikeCastNaiveToInstant,
        castNaiveAggregateToInstant: postgresLikeCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    [SupportedDbtAdapter.DUCKDB]: {
        toProjectTz: (sql, tz) =>
            postgresLikeToProjectTzFromInstant(
                postgresLikeCastToInstant(sql),
                tz,
            ),
        toProjectTzFromInstant: postgresLikeToProjectTzFromInstant,
        toUTC: (sql, tz) => `(${sql}) AT TIME ZONE '${tz}'`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: postgresLikeCastToInstant,
        castNaiveToInstant: postgresLikeCastNaiveToInstant,
        castNaiveAggregateToInstant: postgresLikeCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    // Databricks TIMESTAMP is an instant (LTZ-like), so a session-tz rebase
    // would double-shift it — castToInstant stays identity.
    [SupportedDbtAdapter.DATABRICKS]: {
        toProjectTz: (sql, tz) =>
            `from_utc_timestamp(to_utc_timestamp(${sql}, current_timezone()), '${tz}')`,
        toProjectTzFromInstant: databricksToProjectTzFromInstant,
        toUTC: (sql, tz) => `to_utc_timestamp(${sql}, '${tz}')`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: identityCastToInstant,
        castNaiveToInstant: databricksCastNaiveToInstant,
        castNaiveAggregateToInstant: databricksCastNaiveToInstant,
        castAwareToInstant: databricksCastAwareToInstant,
        freezeInstantOutput: databricksFreezeInstantOutput,
    },
    [SupportedDbtAdapter.SPARK]: {
        toProjectTz: (sql, tz) =>
            `from_utc_timestamp(to_utc_timestamp(${sql}, current_timezone()), '${tz}')`,
        toProjectTzFromInstant: databricksToProjectTzFromInstant,
        toUTC: (sql, tz) => `to_utc_timestamp(${sql}, '${tz}')`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: identityCastToInstant,
        castNaiveToInstant: databricksCastNaiveToInstant,
        castNaiveAggregateToInstant: databricksCastNaiveToInstant,
        castAwareToInstant: databricksCastAwareToInstant,
        freezeInstantOutput: databricksFreezeInstantOutput,
    },
    // Trino returns `timestamp with time zone` values as strings like
    // "2024-01-14 00:00:00.000 America/New_York", which dayjs/moment can't
    // parse — so `toUTC` casts the UTC-shifted result back to a naive
    // `timestamp`. `with_timezone` attaches the project zone explicitly
    // (independent of session zone) before shifting to UTC.
    [SupportedDbtAdapter.TRINO]: {
        toProjectTz: (sql, tz) => trinoToProjectTz(sql, tz),
        toProjectTzFromInstant: trinoToProjectTzFromInstant,
        toUTC: (sql, tz) =>
            `CAST(with_timezone(${sql}, '${tz}') AT TIME ZONE 'UTC' AS timestamp)`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: identityCastToInstant,
        castNaiveToInstant: trinoCastNaiveToInstant,
        castNaiveAggregateToInstant: trinoCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    [SupportedDbtAdapter.ATHENA]: {
        toProjectTz: (sql, tz) => trinoToProjectTz(sql, tz),
        toProjectTzFromInstant: trinoToProjectTzFromInstant,
        toUTC: (sql, tz) =>
            `CAST(with_timezone(${sql}, '${tz}') AT TIME ZONE 'UTC' AS timestamp)`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: identityCastToInstant,
        castNaiveToInstant: trinoCastNaiveToInstant,
        castNaiveAggregateToInstant: trinoCastNaiveToInstant,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
    // Merge the DST fall-back: ClickHouse DateTime always carries a zone and
    // toTimeZone only relabels (instant domain), so the two folded instants
    // would stay distinct. Render project-TZ wall-clock to a string and
    // re-parse as naive UTC so the fold collapses before truncation; toUTC
    // re-parses the truncated wall-clock as project-local to recover a real
    // instant. The minute specifier is %i (%M is month name); %f keeps
    // sub-second precision so MILLISECOND-grain data is not rounded to seconds.
    [SupportedDbtAdapter.CLICKHOUSE]: {
        toProjectTz: (sql, tz) =>
            `toDateTime64(formatDateTime(toTimeZone(${sql}, '${tz}'), '%Y-%m-%d %H:%i:%S.%f'), 3, 'UTC')`,
        toProjectTzFromInstant: (sql, tz) =>
            `toDateTime64(formatDateTime(toTimeZone(${sql}, '${tz}'), '%Y-%m-%d %H:%i:%S.%f'), 3, 'UTC')`,
        toUTC: (sql, tz) =>
            `toTimeZone(toDateTime64(formatDateTime(${sql}, '%Y-%m-%d %H:%i:%S.%f'), 3, '${tz}'), 'UTC')`,
        castAsDate: (sql) => `CAST(${sql} AS DATE)`,
        castToInstant: clickhouseCastToInstant,
        castNaiveToInstant: null,
        castNaiveAggregateToInstant: null,
        castAwareToInstant: null,
        freezeInstantOutput: null,
    },
};

// EXTRACT returns a number/string, so no `toUTC` inverse — one-way shift only.
// `sourceTimezone` semantics match `DateTruncTimezoneConversion.toProjectTz`;
// `toExtractInputTzFromInstant` mirrors `toProjectTzFromInstant` (outer term
// only, for an already-instant input).
type DateExtractTimezoneConversion = {
    toExtractInputTz: (
        sql: string,
        tz: string,
        sourceTimezone?: string,
    ) => string;
    toExtractInputTzFromInstant: (instantSql: string, tz: string) => string;
};

export const dateExtractsTimezoneConversions: Record<
    SupportedDbtAdapter,
    DateExtractTimezoneConversion
> = {
    // `AT TIME ZONE` parses only inside `EXTRACT(... FROM ...)` and requires
    // TIMESTAMP, so coerce DATETIME-shaped inputs.
    [SupportedDbtAdapter.BIGQUERY]: {
        toExtractInputTz: (sql, tz) => `TIMESTAMP(${sql}) AT TIME ZONE '${tz}'`,
        toExtractInputTzFromInstant: (sql, tz) => `${sql} AT TIME ZONE '${tz}'`,
    },
    [SupportedDbtAdapter.SNOWFLAKE]: {
        toExtractInputTz: (sql, tz, sourceTimezone = 'UTC') =>
            `CONVERT_TIMEZONE('${sourceTimezone}', '${tz}', ${sql})`,
        toExtractInputTzFromInstant: (sql, tz) =>
            `CONVERT_TIMEZONE('UTC', '${tz}', ${sql})`,
    },
    [SupportedDbtAdapter.POSTGRES]: {
        toExtractInputTz: (sql, tz) =>
            `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
        toExtractInputTzFromInstant: postgresLikeToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.REDSHIFT]: {
        toExtractInputTz: (sql, tz) =>
            `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
        toExtractInputTzFromInstant: postgresLikeToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.DUCKDB]: {
        toExtractInputTz: (sql, tz) =>
            `(${sql})::timestamptz AT TIME ZONE '${tz}'`,
        toExtractInputTzFromInstant: postgresLikeToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.DATABRICKS]: {
        toExtractInputTz: (sql, tz) =>
            `from_utc_timestamp(to_utc_timestamp(${sql}, current_timezone()), '${tz}')`,
        toExtractInputTzFromInstant: databricksToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.SPARK]: {
        toExtractInputTz: (sql, tz) =>
            `from_utc_timestamp(to_utc_timestamp(${sql}, current_timezone()), '${tz}')`,
        toExtractInputTzFromInstant: databricksToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.TRINO]: {
        toExtractInputTz: (sql, tz) =>
            `CAST(${sql} AT TIME ZONE '${tz}' AS timestamp)`,
        toExtractInputTzFromInstant: trinoToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.ATHENA]: {
        toExtractInputTz: (sql, tz) =>
            `CAST(${sql} AT TIME ZONE '${tz}' AS timestamp)`,
        toExtractInputTzFromInstant: trinoToProjectTzFromInstant,
    },
    [SupportedDbtAdapter.CLICKHOUSE]: {
        toExtractInputTz: (sql, tz) => `toTimeZone(${sql}, '${tz}')`,
        toExtractInputTzFromInstant: (sql, tz) => `toTimeZone(${sql}, '${tz}')`,
    },
};

/** Shift an EXTRACT/format input into the project zone. For a known-naive
 *  column the session-based inner cast is replaced by the explicit
 *  `castNaiveToInstant` rebase from the data timezone; aware/unknown domains
 *  emit exactly the legacy `toExtractInputTz` form. */
export const getExtractInputTzSql = (
    adapterType: SupportedDbtAdapter,
    originalSql: string,
    timezone: string,
    sourceTimezone?: string,
    timestampDomain?: TimestampDomain,
): string => {
    const { castNaiveToInstant } = dateTruncTimezoneConversions[adapterType];
    if (timestampDomain === 'naive' && castNaiveToInstant) {
        return dateExtractsTimezoneConversions[
            adapterType
        ].toExtractInputTzFromInstant(
            castNaiveToInstant(originalSql, sourceTimezone ?? 'UTC'),
            timezone,
        );
    }
    return dateExtractsTimezoneConversions[adapterType].toExtractInputTz(
        originalSql,
        timezone,
        sourceTimezone,
    );
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

const bigqueryDatePart = (
    timeFrame: TimeFrames,
    startOfWeek?: WeekDay | null,
): string =>
    timeFrame === TimeFrames.WEEK && isWeekDay(startOfWeek)
        ? `${timeFrame}(${bigqueryStartOfWeekMap[startOfWeek]})`
        : timeFrame;

const bigqueryConfig: WarehouseConfig = {
    // BigQuery: on the timezone-wrapped path `toProjectTz` has already shifted
    // the value into a naive project-TZ DATETIME, so truncate with
    // DATETIME_TRUNC (the fold merges) and let `toUTC` re-attach the zone. The
    // bare path (no timezone) keeps TIMESTAMP_TRUNC, truncating the UTC instant.
    getSqlForTruncatedDate: (
        timeFrame,
        originalSql,
        type,
        startOfWeek,
        timezone,
    ) => {
        const datePart = bigqueryDatePart(timeFrame, startOfWeek);
        if (type === DimensionType.TIMESTAMP) {
            if (timezone) {
                return `DATETIME_TRUNC(${originalSql}, ${datePart})`;
            }
            return `TIMESTAMP_TRUNC(${originalSql}, ${datePart})`;
        }
        return `DATE_TRUNC(${originalSql}, ${datePart})`;
    },
    // GLITCH-628: BigQuery only prunes partitions for whitelisted functions on
    // the partition column — CAST(TIMESTAMP_TRUNC(col, DAY) AS DATE) full-scans
    // DATETIME-partitioned tables, while DATE(col) / DATE_TRUNC(DATE(col), part)
    // prune. Same value (both read the UTC calendar date on this no-wrap path).
    getSqlForTruncatedDateAsDate: (
        timeFrame,
        originalSql,
        type,
        startOfWeek,
    ) => {
        const datePart = bigqueryDatePart(timeFrame, startOfWeek);
        if (type === DimensionType.TIMESTAMP) {
            return timeFrame === TimeFrames.DAY
                ? `DATE(${originalSql})`
                : `DATE_TRUNC(DATE(${originalSql}), ${datePart})`;
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
        sourceTimezone,
        timestampDomain,
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
                // FORMAT_TIMESTAMP requires TIMESTAMP; coerce DATETIME-shaped
                // inputs (known-naive columns rebase from their data timezone).
                const instant =
                    timestampDomain === 'naive'
                        ? bigqueryCastNaiveToInstant(
                              originalSql,
                              sourceTimezone ?? 'UTC',
                          )
                        : bigqueryCastToInstant(originalSql);
                return `FORMAT_TIMESTAMP('${formatExpression}', ${instant}, '${timezone}')`;
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
        sourceTimezone,
        timestampDomain,
    ) => {
        const sql = timezone
            ? getExtractInputTzSql(
                  SupportedDbtAdapter.SNOWFLAKE,
                  originalSql,
                  timezone,
                  sourceTimezone,
                  timestampDomain,
              )
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
        sourceTimezone,
        timestampDomain,
    ) => {
        const sql = timezone
            ? getExtractInputTzSql(
                  SupportedDbtAdapter.POSTGRES,
                  originalSql,
                  timezone,
                  sourceTimezone,
                  timestampDomain,
              )
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
        sourceTimezone,
        timestampDomain,
    ) => {
        const sql = timezone
            ? getExtractInputTzSql(
                  SupportedDbtAdapter.DATABRICKS,
                  originalSql,
                  timezone,
                  sourceTimezone,
                  timestampDomain,
              )
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
        sourceTimezone,
        timestampDomain,
    ) => {
        const sql = timezone
            ? getExtractInputTzSql(
                  SupportedDbtAdapter.TRINO,
                  originalSql,
                  timezone,
                  sourceTimezone,
                  timestampDomain,
              )
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
        sourceTimezone,
        timestampDomain,
    ) => {
        const sql = timezone
            ? getExtractInputTzSql(
                  SupportedDbtAdapter.CLICKHOUSE,
                  originalSql,
                  timezone,
                  sourceTimezone,
                  timestampDomain,
              )
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
    [SupportedDbtAdapter.SPARK]: databricksConfig, // Spark uses same SQL dialect as Databricks
    [SupportedDbtAdapter.TRINO]: trinoConfig,
    [SupportedDbtAdapter.ATHENA]: trinoConfig, // Athena uses Trino SQL dialect
    [SupportedDbtAdapter.CLICKHOUSE]: clickhouseConfig,
};

/**
 * Generates DATE_TRUNC SQL. When a timezone is provided, the truncation is
 * performed in the project TZ and the result is converted back to a proper
 * UTC instant so downstream consumers apply .tz(project_tz) uniformly.
 */
// Adapters that keep the wider target == source skip: Databricks/Spark
// timestamps are instants (their wrap double-shifts them at equal zones) and
// Trino/Athena sessions do not rebase naive columns, so the wrap buys nothing
// there. Naive-column handling for these is tracked separately.
const equalZonesSkipAdapters: ReadonlySet<SupportedDbtAdapter> = new Set([
    SupportedDbtAdapter.DATABRICKS,
    SupportedDbtAdapter.SPARK,
    SupportedDbtAdapter.TRINO,
    SupportedDbtAdapter.ATHENA,
]);

// Source defaults to UTC when unset (matches `getColumnTimezone`). On
// session-property warehouses the wrap is a genuine no-op only when both
// sides are UTC: for a naive column, target == source still requires the
// wrap's inner `castToInstant` rebase — skipping it misreads the wall clock
// as UTC downstream. The all-UTC skip avoids the cast that defeats partition
// pruning on warehouses like BigQuery. Every wrap site (dim trunc, extract,
// format, filter literal) shares this predicate so symmetry is enforced
// centrally.
export const isTimezoneRoundTripNoOp = (
    adapterType: SupportedDbtAdapter,
    timezone: string,
    sourceTimezone?: string,
    timestampDomain?: TimestampDomain,
): boolean => {
    const source = sourceTimezone ?? 'UTC';
    // Known-naive columns need the explicit rebase whenever either zone is
    // non-UTC — the wider equal-zones skip would wrongly drop it on
    // Trino/Databricks at display == data timezone.
    if (
        timestampDomain === 'naive' &&
        dateTruncTimezoneConversions[adapterType].castNaiveToInstant !== null
    ) {
        return timezone === 'UTC' && source === 'UTC';
    }
    if (equalZonesSkipAdapters.has(adapterType)) return timezone === source;
    return timezone === 'UTC' && source === 'UTC';
};

// Returns the resolved (timezone, sourceTimezone, timestampDomain) when the
// dim needs a tz wrap, else null. Wrap conditions: TIMESTAMP-typed dim AND a
// target timezone AND target != source.
const resolveTimezoneWrap = (
    adapterType: SupportedDbtAdapter,
    type: DimensionType,
    timezone?: string,
    sourceTimezone?: string,
    timestampDomain?: TimestampDomain,
): {
    timezone: string;
    sourceTimezone?: string;
    timestampDomain?: TimestampDomain;
} | null => {
    if (type !== DimensionType.TIMESTAMP || !timezone) return null;
    if (
        isTimezoneRoundTripNoOp(
            adapterType,
            timezone,
            sourceTimezone,
            timestampDomain,
        )
    )
        return null;
    return { timezone, sourceTimezone, timestampDomain };
};

export const getSqlForTruncatedDate = (
    adapterType: SupportedDbtAdapter,
    timeFrame: TimeFrames,
    originalSql: string,
    type: DimensionType,
    startOfWeek?: WeekDay | null,
    timezone?: string,
    sourceTimezone?: string,
    timestampDomain?: TimestampDomain,
    castDayOrCoarserToDate: boolean = false,
): string => {
    const wrap = resolveTimezoneWrap(
        adapterType,
        type,
        timezone,
        sourceTimezone,
        timestampDomain,
    );
    // GLITCH-452: day-or-coarser grains emit a real DATE so the warehouse type
    // matches the metadata; sub-day grains stay TIMESTAMP.
    const castToDate = castDayOrCoarserToDate && !isSubDayTimeFrame(timeFrame);
    if (!wrap) {
        const config = warehouseConfigs[adapterType];
        if (castToDate) {
            // Per-adapter direct-to-DATE form where CAST-over-trunc would
            // defeat partition pruning (GLITCH-628); generic cast elsewhere.
            if (config.getSqlForTruncatedDateAsDate) {
                return config.getSqlForTruncatedDateAsDate(
                    timeFrame,
                    originalSql,
                    type,
                    startOfWeek,
                );
            }
            return `CAST(${config.getSqlForTruncatedDate(timeFrame, originalSql, type, startOfWeek)} AS DATE)`;
        }
        return config.getSqlForTruncatedDate(
            timeFrame,
            originalSql,
            type,
            startOfWeek,
        );
    }

    const {
        toProjectTz,
        toProjectTzFromInstant,
        toUTC,
        castAsDate,
        castNaiveToInstant,
        castAwareToInstant,
        freezeInstantOutput,
    } = dateTruncTimezoneConversions[adapterType];
    // Known domain: substitute the explicit, session-independent instant for
    // the session-based inner cast; unknown keeps the legacy composition
    // byte-identical.
    let explicitInstant: string | null = null;
    if (wrap.timestampDomain === 'naive' && castNaiveToInstant) {
        explicitInstant = castNaiveToInstant(
            originalSql,
            wrap.sourceTimezone ?? 'UTC',
        );
    } else if (wrap.timestampDomain === 'aware' && castAwareToInstant) {
        explicitInstant = castAwareToInstant(originalSql);
    }
    const input =
        explicitInstant !== null
            ? toProjectTzFromInstant(explicitInstant, wrap.timezone)
            : toProjectTz(originalSql, wrap.timezone, wrap.sourceTimezone);
    const truncated = warehouseConfigs[adapterType].getSqlForTruncatedDate(
        timeFrame,
        input,
        type,
        startOfWeek,
        wrap.timezone,
    );
    // Day-or-coarser grains return a real DATE (drop the toUTC round-trip).
    // Every adapter's wrapped path now truncates to a naive wall-clock value
    // (BigQuery shifts to DATETIME in toProjectTz), so the per-adapter castAsDate
    // — CAST(... AS DATE) everywhere — reads the right calendar date in the
    // project tz. See `castAsDate` in dateTruncTimezoneConversions.
    if (!castToDate) {
        const output = toUTC(truncated, wrap.timezone);
        // Explicit-path sub-day outputs must not depend on the session.
        return explicitInstant !== null && freezeInstantOutput
            ? freezeInstantOutput(output)
            : output;
    }
    return castAsDate(truncated, wrap.timezone);
};

// DATE base dimensions short-circuit: no time component to shift.
export const getSqlForDatePart = (
    adapterType: SupportedDbtAdapter,
    timeFrame: TimeFrames,
    originalSql: string,
    type: DimensionType,
    startOfWeek?: WeekDay | null,
    timezone?: string,
    sourceTimezone?: string,
    timestampDomain?: TimestampDomain,
): string => {
    const wrap = resolveTimezoneWrap(
        adapterType,
        type,
        timezone,
        sourceTimezone,
        timestampDomain,
    );
    const wrappedSql = wrap
        ? getExtractInputTzSql(
              adapterType,
              originalSql,
              wrap.timezone,
              wrap.sourceTimezone,
              wrap.timestampDomain,
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
    sourceTimezone?: string,
    timestampDomain?: TimestampDomain,
): string => {
    const wrap = resolveTimezoneWrap(
        adapterType,
        type,
        timezone,
        sourceTimezone,
        timestampDomain,
    );
    if (!wrap) {
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
        wrap.timezone,
        wrap.sourceTimezone,
        wrap.timestampDomain,
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
        sourceTimezone?: string,
        timestampDomain?: TimestampDomain,
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

export type ResolvedAdditionalTimeIntervals = {
    date: (TimeFrames | string)[];
    timestamp: (TimeFrames | string)[];
};

/**
 * Built-in default time frames for a dimension type, with project-level
 * `additional_time_intervals` appended (de-duplicated, built-ins first).
 */
export const getTimeFramesWithProjectDefaults = (
    type: DimensionType,
    additionalTimeIntervals?: ResolvedAdditionalTimeIntervals,
): (TimeFrames | string)[] => {
    const additions =
        type === DimensionType.TIMESTAMP
            ? (additionalTimeIntervals?.timestamp ?? [])
            : (additionalTimeIntervals?.date ?? []);
    const seen = new Set<string>();
    return [...getDefaultTimeFrames(type), ...additions].filter((value) => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
    });
};

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
