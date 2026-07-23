// Query builder
export { query } from './query';
export { savedChart, type SavedChartQuery } from './savedChart';

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

// Feature manifest (also exported via the "./features" subpath for hosts)
export {
    SDK_FEATURES,
    SDK_FEATURE_KEYS,
    SDK_MANIFEST_MESSAGE_TYPE,
    type SdkFeature,
    type SdkManifestMessage,
} from './features';

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
    ExternalFetchMethod,
    ExternalFetchOptions,
    ExternalFetchResult,
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
    SdkExternalFetchRequest,
    SdkExternalFetchResponse,
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

// Data app viz render context (host-pushed rows + field mapping)
export {
    VizContextProvider,
    useVizContext,
    getFormatted,
    getRaw,
} from './vizContext';
export type {
    VizContext,
    VizContextCell,
    VizContextRow,
    DataAppVizContextMessage,
    VizContextRequestMessage,
} from './vizContext';

// Shareable URL state (seeded from and written back to the host page URL)
export { useUrlState } from './urlState';
export type { SdkUrlStateChangeMessage, UrlStateMap } from './urlState';
