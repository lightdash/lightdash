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
