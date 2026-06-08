import { formatTimestamp } from '../utils/formatting';
import { dateTruncTimezoneConversions } from '../utils/timeFrames';
import { SupportedDbtAdapter } from './dbt';
import {
    type CreateWarehouseCredentials,
    type WarehouseTypes,
} from './projects';

// One interpreted row of the preview: the naive "now" disambiguated under a
// source zone, yielding a UTC instant, then rendered in the project timezone.
export type DataTimezonePreviewRow = {
    interpretedAs: string; // the source zone used for disambiguation
    instant: string; // UTC instant the warehouse returned for this interpretation
    rendered: string; // formatTimestamp(instant, projectTimezone)
};

// The `results` payload of the API response.
export type ApiDataTimezonePreviewResults = {
    warehouseType: WarehouseTypes;
    selectedDataTimezone: string; // what the user picked (or 'UTC' fallback)
    effectiveSourceTimezone: string; // getColumnTimezone(credentials)
    projectTimezone: string; // 'UTC' in create flow
    raw: string; // literal CURRENT_TIMESTAMP the warehouse returned
    effective: DataTimezonePreviewRow; // interpreted under effectiveSourceTimezone
    utcBaseline: DataTimezonePreviewRow; // interpreted under 'UTC'
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

// One query: the literal raw now, plus the naive now disambiguated under the
// effective source zone and under UTC. toUTC wraps a naive expression and
// returns the UTC instant, matching the production Path A conversion.
export const buildDataTimezonePreviewSql = (
    adapterType: SupportedDbtAdapter,
    effectiveSourceTimezone: string,
): string => {
    const naiveNow = currentNaiveTimestampSql[adapterType];
    const { toUTC } = dateTruncTimezoneConversions[adapterType];
    return (
        `SELECT CURRENT_TIMESTAMP AS raw, ` +
        `${toUTC(naiveNow, effectiveSourceTimezone)} AS effective_instant, ` +
        `${toUTC(naiveNow, 'UTC')} AS utc_instant`
    );
};

type RawPreviewRow = {
    raw: unknown;
    effective_instant: unknown;
    utc_instant: unknown;
};

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
    const renderRow = (
        instant: unknown,
        interpretedAs: string,
    ): DataTimezonePreviewRow => {
        const instantStr = String(instant);
        return {
            interpretedAs,
            instant: instantStr,
            rendered: formatTimestamp(
                instantStr,
                undefined,
                false,
                projectTimezone,
            ),
        };
    };

    return {
        warehouseType,
        selectedDataTimezone,
        effectiveSourceTimezone,
        projectTimezone,
        raw: String(row.raw),
        effective: renderRow(row.effective_instant, effectiveSourceTimezone),
        utcBaseline: renderRow(row.utc_instant, 'UTC'),
    };
};
