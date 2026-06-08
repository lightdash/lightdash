import moment from 'moment-timezone';
import { formatTimestamp } from '../utils/formatting';
import { dateTruncTimezoneConversions } from '../utils/timeFrames';
import { SupportedDbtAdapter } from './dbt';
import {
    type CreateWarehouseCredentials,
    type WarehouseTypes,
} from './projects';
import { TimeFrames } from './timeFrames';

// A timestamp column with NO stored timezone (TIMESTAMP WITHOUT TIME ZONE,
// Snowflake NTZ, BigQuery DATETIME). It has no instant until a zone is
// assumed — the data timezone IS that assumption, so these columns ARE
// affected by the setting.
export type DataTimezonePreviewNaive = {
    interpretedAs: string; // the zone Lightdash assumes (effective source zone)
    raw: string; // the bare wall-clock the warehouse holds, no zone attached
    readAs: string; // same wall-clock with the assumed zone attached
    rendered: string; // the resulting instant rendered in the project timezone
};

// A timestamp column that already carries a timezone (timestamptz, Snowflake
// TZ/LTZ, BigQuery TIMESTAMP). Its instant is already pinned, so the data
// timezone is ignored — these columns are NOT affected by the setting.
export type DataTimezonePreviewAware = {
    raw: string; // the instant as the warehouse pins it (rendered in UTC)
    rendered: string; // the same instant rendered in the project timezone
};

// The `results` payload of the API response.
export type ApiDataTimezonePreviewResults = {
    warehouseType: WarehouseTypes;
    selectedDataTimezone: string; // what the user picked (or 'UTC' fallback)
    effectiveSourceTimezone: string; // getColumnTimezone(credentials)
    projectTimezone: string; // 'UTC' in create flow
    // false when the effective zone is UTC (unset, or Snowflake stores UTC) —
    // i.e. the data timezone does not actually shift naive timestamps.
    dataTimezoneApplies: boolean;
    naive: DataTimezonePreviewNaive;
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

// Naive (zone-less) "now" per dialect. Feeds the toUTC conversions, which
// interpret a naive timestamp as being in a given zone. Full Record for
// type-safety; only the 7 form-exposed dialects are reachable in practice.
export const currentNaiveTimestampSql: Record<SupportedDbtAdapter, string> = {
    [SupportedDbtAdapter.POSTGRES]: 'LOCALTIMESTAMP',
    [SupportedDbtAdapter.REDSHIFT]: 'LOCALTIMESTAMP',
    [SupportedDbtAdapter.DUCKDB]: 'LOCALTIMESTAMP',
    [SupportedDbtAdapter.SNOWFLAKE]:
        'CAST(CURRENT_TIMESTAMP() AS TIMESTAMP_NTZ)',
    [SupportedDbtAdapter.DATABRICKS]: 'CAST(CURRENT_TIMESTAMP() AS TIMESTAMP)',
    [SupportedDbtAdapter.SPARK]: 'CAST(CURRENT_TIMESTAMP() AS TIMESTAMP)',
    [SupportedDbtAdapter.TRINO]: 'CAST(CURRENT_TIMESTAMP AS timestamp)',
    [SupportedDbtAdapter.ATHENA]: 'CAST(CURRENT_TIMESTAMP AS timestamp)',
    [SupportedDbtAdapter.CLICKHOUSE]: 'now()',
    [SupportedDbtAdapter.BIGQUERY]: 'CURRENT_DATETIME()',
};

// One query returning two instants: a naive "now" disambiguated under the
// effective source zone (the column-without-a-timezone case), and the live
// tz-aware "now" whose instant is already pinned (the column-with-a-timezone
// case, unaffected by the data timezone).
export const buildDataTimezonePreviewSql = (
    adapterType: SupportedDbtAdapter,
    effectiveSourceTimezone: string,
): string => {
    const naiveNow = currentNaiveTimestampSql[adapterType];
    const { toUTC } = dateTruncTimezoneConversions[adapterType];
    return (
        `SELECT CURRENT_TIMESTAMP AS aware_instant, ` +
        `${toUTC(naiveNow, effectiveSourceTimezone)} AS naive_instant`
    );
};

type RawPreviewRow = {
    aware_instant: unknown;
    naive_instant: unknown;
};

// Cleaner than the default millisecond format for a human-facing preview.
const renderInZone = (instant: string, timezone: string): string =>
    formatTimestamp(instant, TimeFrames.SECOND, false, timezone);

export const buildDataTimezonePreviewResponse = ({
    row,
    warehouseType,
    selectedDataTimezone,
    effectiveSourceTimezone,
    projectTimezone,
}: {
    row: RawPreviewRow;
    warehouseType: WarehouseTypes;
    selectedDataTimezone: string;
    effectiveSourceTimezone: string;
    projectTimezone: string;
}): ApiDataTimezonePreviewResults => {
    const naiveInstant = String(row.naive_instant);
    const awareInstant = String(row.aware_instant);

    return {
        warehouseType,
        selectedDataTimezone,
        effectiveSourceTimezone,
        projectTimezone,
        dataTimezoneApplies: effectiveSourceTimezone !== 'UTC',
        naive: {
            interpretedAs: effectiveSourceTimezone,
            // bare wall-clock the warehouse holds, with no offset attached
            raw: moment
                .utc(naiveInstant)
                .tz(effectiveSourceTimezone)
                .format('YYYY-MM-DD, HH:mm:ss'),
            readAs: renderInZone(naiveInstant, effectiveSourceTimezone),
            rendered: renderInZone(naiveInstant, projectTimezone),
        },
        aware: {
            raw: renderInZone(awareInstant, 'UTC'),
            rendered: renderInZone(awareInstant, projectTimezone),
        },
    };
};
