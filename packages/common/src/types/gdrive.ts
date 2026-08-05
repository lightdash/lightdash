import { type MetricQueryResponse } from './metricQuery';
import { type PivotConfig } from './pivot';
import { type TraceTaskBase } from './scheduler';

export type ApiGdriveAccessTokenResponse = {
    status: 'ok';
    results: string;
};

export type CustomLabel = {
    [key: string]: string;
};

export type UploadMetricGsheet = {
    projectUuid: string;
    exploreId: string;
    metricQuery: MetricQueryResponse; // tsoa doesn't support complex types like MetricQuery
    showTableNames: boolean;
    columnOrder: string[];
    customLabels?: CustomLabel;
    hiddenFields?: string[];
    pivotConfig?: PivotConfig;
};

export type GsheetColumnType =
    | 'string'
    | 'number'
    | 'date'
    | 'timestamp'
    | 'boolean';

export type GsheetColumn = {
    key: string;
    label?: string;
    type?: GsheetColumnType;
};

export type GsheetRow = Record<string, string | number | boolean | null>;

export type UploadGsheetFromRows = {
    projectUuid: string;
    title: string;
    columns: GsheetColumn[];
    rows: GsheetRow[];
};

export type UploadMetricGsheetPayload = TraceTaskBase &
    UploadMetricGsheet & {
        source: 'metricQuery';
    };

export type UploadGsheetFromRowsPayload = TraceTaskBase &
    UploadGsheetFromRows & {
        source: 'rows';
    };

export type UploadGsheetPayload =
    | UploadMetricGsheetPayload
    | UploadGsheetFromRowsPayload;

/** Max body size accepted by /gdrive/upload-gsheet-from-rows. */
export const UPLOAD_GSHEET_FROM_ROWS_MAX_BYTES = 25 * 1024 * 1024;

/** Max row count accepted by /gdrive/upload-gsheet-from-rows. */
export const UPLOAD_GSHEET_FROM_ROWS_MAX_ROWS = 100_000;

/**
 * Google caps a spreadsheet at 10 million cells across all tabs. Budget half of
 * that so a large dashboard export fails predictably by truncating tabs rather
 * than being rejected mid-write.
 */
export const EXPORT_DASHBOARD_GSHEET_MAX_CELLS = 5_000_000;

/** Max rows written to any single tab of a dashboard export. */
export const EXPORT_DASHBOARD_GSHEET_MAX_ROWS_PER_TAB = 50_000;

/** Title of the index tab written as the first tab of a dashboard export. */
export const EXPORT_DASHBOARD_GSHEET_INDEX_TAB = 'Export summary';

export type ExportDashboardGsheetOutputStatus =
    | 'success'
    | 'truncated'
    | 'failed'
    | 'unsupported';

/** One dashboard output and how it fared in the export. */
export type ExportDashboardGsheetOutput = {
    tileUuid: string;
    tabName: string;
    sourceName: string;
    status: ExportDashboardGsheetOutputStatus;
    rowCount: number;
    error: string | null;
};
