import moment from 'moment-timezone';
import { formatTimestamp } from '../utils/formatting';
import { isValidTimezone } from '../utils/scheduler';
import { dateTruncTimezoneConversions } from '../utils/timeFrames';
import { SupportedDbtAdapter } from './dbt';
import { ParameterError } from './errors';
import { type CreateWarehouseCredentials } from './projects';
import { TimeFrames } from './timeFrames';

// A timestamp column with NO stored timezone (TIMESTAMP WITHOUT TIME ZONE,
// Snowflake NTZ, BigQuery DATETIME). It has no instant until a zone is
// assumed. The data timezone IS that assumption, so these columns ARE
// affected by the setting.
export type DataTimezonePreviewNaive = {
    interpretedAs: string; // the zone Lightdash assumes (effective source zone)
    raw: string; // the bare wall-clock the warehouse holds, no zone attached
    readAs: string; // same wall-clock with the assumed zone attached
    rendered: string; // the resulting instant rendered in the project timezone
};

// A timestamp column that already carries a timezone (timestamptz, Snowflake
// TZ/LTZ, BigQuery TIMESTAMP). Its instant is already pinned, so the data
// timezone is ignored, so these columns are NOT affected by the setting.
export type DataTimezonePreviewAware = {
    raw: string; // the instant as the warehouse pins it (rendered in UTC)
    rendered: string; // the same instant rendered in the project timezone
};

// The `results` payload of the API response.
export type ApiDataTimezonePreviewResults = {
    projectTimezone: string; // zone viewers see ('UTC' in the create flow)
    dataTimezoneApplies: boolean; // false when the source zone is UTC (a no-op)
    naive: DataTimezonePreviewNaive; // .interpretedAs carries the source zone
    aware: DataTimezonePreviewAware;
};

export type ApiDataTimezonePreview = {
    status: 'ok';
    results: ApiDataTimezonePreviewResults;
};

export type DataTimezonePreviewRequest = {
    credentials: CreateWarehouseCredentials;
    projectUuid?: string;
};

// Wraps one backend-computed wall-clock ('YYYY-MM-DD HH:mm:ss') as a zone-less
// timestamp literal per dialect. Injecting a fixed literal - instead of each
// warehouse's now() - makes the preview identical across warehouses and
// independent of warehouse/server timezone. Fed to toUTC for interpretation.
const naiveLiteralSql: Record<
    SupportedDbtAdapter,
    (wallClock: string) => string
> = {
    [SupportedDbtAdapter.POSTGRES]: (w) => `TIMESTAMP '${w}'`,
    [SupportedDbtAdapter.REDSHIFT]: (w) => `TIMESTAMP '${w}'`,
    [SupportedDbtAdapter.DUCKDB]: (w) => `TIMESTAMP '${w}'`,
    [SupportedDbtAdapter.SNOWFLAKE]: (w) => `'${w}'::TIMESTAMP_NTZ`,
    [SupportedDbtAdapter.DATABRICKS]: (w) => `TIMESTAMP '${w}'`,
    [SupportedDbtAdapter.SPARK]: (w) => `TIMESTAMP '${w}'`,
    [SupportedDbtAdapter.TRINO]: (w) => `TIMESTAMP '${w}'`,
    [SupportedDbtAdapter.ATHENA]: (w) => `TIMESTAMP '${w}'`,
    [SupportedDbtAdapter.CLICKHOUSE]: (w) => `'${w}'`,
    [SupportedDbtAdapter.BIGQUERY]: (w) => `DATETIME '${w}'`,
};

const NAIVE_WALL_CLOCK_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const NAIVE_WALL_CLOCK_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// The current instant as a bare UTC wall-clock. moment.utc keeps it independent
// of the backend's local timezone.
export const currentUtcWallClock = (): string =>
    moment.utc().format(NAIVE_WALL_CLOCK_FORMAT);

// Interprets one fixed naive wall-clock under the data timezone. The tz-aware
// ("already an instant") case is computed in Node, so the query is naive-only.
export const buildDataTimezonePreviewSql = (
    adapterType: SupportedDbtAdapter,
    dataTimezone: string,
    nowWallClock: string,
): string => {
    if (!isValidTimezone(dataTimezone)) {
        throw new ParameterError('Invalid data timezone');
    }
    if (!NAIVE_WALL_CLOCK_RE.test(nowWallClock)) {
        throw new ParameterError('Invalid timestamp');
    }
    const { toUTC } = dateTruncTimezoneConversions[adapterType];
    return `SELECT ${toUTC(
        naiveLiteralSql[adapterType](nowWallClock),
        dataTimezone,
    )} AS naive_instant`;
};

// Cleaner than the default millisecond format for a human-facing preview.
const renderInZone = (instant: moment.MomentInput, timezone: string): string =>
    formatTimestamp(instant, TimeFrames.SECOND, false, timezone);

// A bare wall-clock with no offset - the "no timezone yet" step.
const renderWallClock = (instant: moment.MomentInput, zone: string): string =>
    moment.utc(instant).tz(zone).format('YYYY-MM-DD, HH:mm:ss');

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
    sourceTimezone,
    projectTimezone,
    nowWallClock,
}: {
    row: Record<string, unknown>;
    sourceTimezone: string;
    projectTimezone: string;
    nowWallClock: string;
}): ApiDataTimezonePreviewResults => {
    // Drivers return naive_instant as a Date (pg, Snowflake, ...) or string
    // (Trino, ClickHouse). Pass the raw value to moment; String()-ing a Date
    // first yields a locale string moment.utc parses via its non-ISO fallback,
    // silently shifting the instant by the backend's UTC offset.
    const naiveInstant = readColumn(row, 'naive_instant') as moment.MomentInput;
    // Tz-aware columns are already pinned instants - the current moment read as
    // UTC. Data-tz-independent, so computed here rather than queried.
    const awareInstant = moment.utc(nowWallClock, NAIVE_WALL_CLOCK_FORMAT);

    return {
        projectTimezone,
        dataTimezoneApplies: sourceTimezone !== 'UTC',
        naive: {
            interpretedAs: sourceTimezone,
            raw: renderWallClock(naiveInstant, sourceTimezone),
            readAs: renderInZone(naiveInstant, sourceTimezone),
            rendered: renderInZone(naiveInstant, projectTimezone),
        },
        aware: {
            raw: renderInZone(awareInstant, 'UTC'),
            rendered: renderInZone(awareInstant, projectTimezone),
        },
    };
};
