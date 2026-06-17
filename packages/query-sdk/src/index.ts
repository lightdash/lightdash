// Query builder
export { query } from './query';

// Drill-down helper
export { drillDown } from './drillDown';

// Client
export { createClient, LightdashClient } from './client';

// React hook
export { useLightdash } from './useLightdash';

// Provider
export { LightdashProvider, useLightdashClient } from './LightdashProvider';

// Transports
export { createApiTransport, type FetchAdapter } from './apiTransport';
export { createPostMessageTransport } from './postMessageTransport';

// Types
export type {
    AdditionalMetric,
    Column,
    CustomDimension,
    DownloadResultsFileType,
    DownloadResultsLimit,
    DownloadResultsOptions,
    DownloadResultsResult,
    DownloadResultsValues,
    DownloadUnderlyingDataOptions,
    Filter,
    FilterOperator,
    FilterValue,
    FormatFunction,
    LightdashClientConfig,
    LightdashUser,
    MetricType,
    QueryDefinition,
    QueryResult,
    Row,
    Sort,
    TableCalculation,
    Transport,
    UnitOfTime,
    UnderlyingDataOptions,
    UnderlyingDataResult,
} from './types';

export type {
    SdkFetchRequest,
    SdkFetchResponse,
    SdkReadyMessage,
    SdkScreenshotAvailableMessage,
    SdkScreenshotRequest,
    SdkScreenshotResponse,
    SdkGsheetExportRequest,
    SdkGsheetExportResponse,
    SdkGsheetExportColumn,
    SdkGsheetExportColumnType,
    SdkGsheetExportRow,
} from './postMessageTransport';

// Element inspector (click-to-edit) — protocol types for parent bridge.
export type {
    InspectAvailableMessage,
    InspectSelectedMessage,
} from './inspector';

// Google Sheets export (data apps)
export { exportToSheets } from './exportToSheets';
export type {
    ExportToSheetsOptions,
    ExportToSheetsResult,
} from './exportToSheets';
