import moment from 'moment-timezone';
import { formatTimestamp } from '../utils/formatting';
import { SupportedDbtAdapter } from './dbt';
import { ParameterError } from './errors';
import {
    type CreateWarehouseCredentials,
    type WarehouseTypes,
} from './projects';
import { TimeFrames } from './timeFrames';

// A timestamp column with no stored timezone (NTZ): the data timezone is the
// assumption that turns it into an instant, so these columns ARE affected.
export type DataTimezonePreviewNaive = {
    interpretedAs: string; // the session zone the warehouse read it in
    raw: string; // the bare wall-clock the warehouse holds, no zone attached
    readAs: string; // same wall-clock with the session zone attached
    rendered: string; // the resulting instant rendered in the project timezone
};

// A timestamp column that already carries a timezone: its instant is pinned, so
// the data timezone is ignored and these columns are NOT affected.
export type DataTimezonePreviewAware = {
    raw: string; // the instant as the warehouse pins it (rendered in UTC)
    rendered: string; // the same instant rendered in the project timezone
};

// The `results` payload of the API response.
export type ApiDataTimezonePreviewResults = {
    projectTimezone: string; // zone viewers see ('UTC' in the create flow)
    dataTimezoneApplies: boolean; // true when a data timezone is explicitly set
    naive: DataTimezonePreviewNaive; // .interpretedAs carries the session zone
    aware: DataTimezonePreviewAware;
};

export type ApiDataTimezonePreview = {
    status: 'ok';
    results: ApiDataTimezonePreviewResults;
};

// The two preview flows carry different inputs. Create types every credential
// fresh, so it sends them. Edit reuses the stored connection's secrets and only
// overrides the unsaved data timezone, so it sends no credentials at all - just
// the project, the warehouse type (to reject a type switched but not yet saved),
// and the data timezone being tried (null when cleared).
export type DataTimezonePreviewRequest =
    | {
          mode: 'create';
          credentials: CreateWarehouseCredentials;
      }
    | {
          mode: 'edit';
          projectUuid: string;
          warehouseType: WarehouseTypes;
          dataTimezone: string | null;
      };

// Reads a bare literal through the session timezone (set by the client from the
// data timezone) and returns it as a UTC 'YYYY-MM-DD HH:mm:ss' string - the same
// path real queries use to interpret NTZ columns. The string form parses back
// unambiguously regardless of driver Date handling.
const sessionUtcStringSql: Record<
    SupportedDbtAdapter,
    (wallClock: string) => string
> = {
    [SupportedDbtAdapter.POSTGRES]: (w) =>
        `to_char((TIMESTAMP '${w}')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`,
    [SupportedDbtAdapter.REDSHIFT]: (w) =>
        `to_char((TIMESTAMP '${w}')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`,
    [SupportedDbtAdapter.DUCKDB]: (w) =>
        `strftime((TIMESTAMP '${w}')::TIMESTAMPTZ AT TIME ZONE 'UTC', '%Y-%m-%d %H:%M:%S')`,
    [SupportedDbtAdapter.SNOWFLAKE]: (w) =>
        `TO_CHAR(CONVERT_TIMEZONE('UTC', '${w}'::TIMESTAMP_NTZ), 'YYYY-MM-DD HH24:MI:SS')`,
    [SupportedDbtAdapter.DATABRICKS]: (w) =>
        `date_format(to_utc_timestamp('${w}', current_timezone()), 'yyyy-MM-dd HH:mm:ss')`,
    [SupportedDbtAdapter.SPARK]: (w) =>
        `date_format(to_utc_timestamp('${w}', current_timezone()), 'yyyy-MM-dd HH:mm:ss')`,
    [SupportedDbtAdapter.TRINO]: (w) =>
        `format_datetime(CAST(TIMESTAMP '${w}' AS timestamp with time zone) AT TIME ZONE 'UTC', 'yyyy-MM-dd HH:mm:ss')`,
    [SupportedDbtAdapter.ATHENA]: (w) =>
        `format_datetime(CAST(TIMESTAMP '${w}' AS timestamp with time zone) AT TIME ZONE 'UTC', 'yyyy-MM-dd HH:mm:ss')`,
    [SupportedDbtAdapter.CLICKHOUSE]: (w) =>
        `toString(toTimeZone(toDateTime('${w}'), 'UTC'))`,
    // BigQuery has no session-timezone plumbing (its data tz UI is hidden), so
    // the bare value is effectively UTC.
    [SupportedDbtAdapter.BIGQUERY]: (w) =>
        `FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', TIMESTAMP('${w}', 'UTC'), 'UTC')`,
};

const NAIVE_WALL_CLOCK_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const NAIVE_WALL_CLOCK_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const RENDER_FORMAT = 'YYYY-MM-DD, HH:mm:ss';

// The current instant as a bare UTC wall-clock. moment.utc keeps it independent
// of the backend's local timezone.
export const currentUtcWallClock = (): string =>
    moment.utc().format(NAIVE_WALL_CLOCK_FORMAT);

// The query carries no zone of its own; the session (set by the client) does
// the interpreting.
export const buildDataTimezonePreviewSql = (
    adapterType: SupportedDbtAdapter,
    nowWallClock: string,
): string => {
    if (!NAIVE_WALL_CLOCK_RE.test(nowWallClock)) {
        throw new ParameterError('Invalid timestamp');
    }
    return `SELECT ${sessionUtcStringSql[adapterType](
        nowWallClock,
    )} AS naive_instant`;
};

// Cleaner than the default millisecond format for a human-facing preview.
const renderInZone = (instant: moment.MomentInput, timezone: string): string =>
    formatTimestamp(instant, TimeFrames.SECOND, false, timezone);

// Renders an instant at a fixed offset, for when we know the offset the
// warehouse used but not its zone name.
const renderAtOffset = (
    instant: moment.MomentInput,
    offsetMinutes: number,
): string =>
    moment.utc(instant).utcOffset(offsetMinutes).format(`${RENDER_FORMAT} (Z)`);

// Labels a zone by its offset when we only know the offset, not the name.
const offsetLabel = (offsetMinutes: number): string =>
    offsetMinutes === 0
        ? 'UTC'
        : `UTC${moment.utc().utcOffset(offsetMinutes).format('Z')}`;

// Snowflake upper-cases unquoted column aliases, so look the column up
// case-insensitively rather than assuming the literal alias casing.
const readColumn = (row: Record<string, unknown>, name: string): unknown => {
    if (name in row) return row[name];
    const key = Object.keys(row).find(
        (k) => k.toLowerCase() === name.toLowerCase(),
    );
    return key === undefined ? undefined : row[key];
};

export const buildDataTimezonePreviewResponse = ({
    row,
    nowWallClock,
    projectTimezone,
    dataTimezone,
}: {
    row: Record<string, unknown>;
    nowWallClock: string;
    projectTimezone: string;
    dataTimezone: string | undefined;
}): ApiDataTimezonePreviewResults => {
    // The instant the warehouse parsed the bare literal into (returned as UTC).
    const naiveInstant = moment.utc(
        readColumn(row, 'naive_instant') as moment.MomentInput,
        NAIVE_WALL_CLOCK_FORMAT,
    );
    // The gap between what we sent and what came back is the offset the warehouse
    // actually used - the source of truth, since some warehouses ignore the
    // session and read UTC anyway.
    const sentAsUtc = moment.utc(nowWallClock, NAIVE_WALL_CLOCK_FORMAT);
    const sessionOffsetMinutes = sentAsUtc.diff(naiveInstant, 'minutes');

    // Only label the step with the zone name if the warehouse actually used it.
    const honored =
        dataTimezone !== undefined &&
        moment
            .tz(nowWallClock, NAIVE_WALL_CLOCK_FORMAT, dataTimezone)
            .utcOffset() === sessionOffsetMinutes;

    // Tz-aware columns are already pinned instants, so compute in Node, not SQL.
    const awareInstant = moment.utc(nowWallClock, NAIVE_WALL_CLOCK_FORMAT);

    return {
        projectTimezone,
        dataTimezoneApplies: dataTimezone !== undefined,
        naive: {
            interpretedAs:
                honored && dataTimezone
                    ? dataTimezone
                    : offsetLabel(sessionOffsetMinutes),
            raw: sentAsUtc.format(RENDER_FORMAT),
            readAs: renderAtOffset(naiveInstant, sessionOffsetMinutes),
            rendered: renderInZone(naiveInstant, projectTimezone),
        },
        aware: {
            raw: renderInZone(awareInstant, 'UTC'),
            rendered: renderInZone(awareInstant, projectTimezone),
        },
    };
};
