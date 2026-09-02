import { type ResultColumns } from './results';

/** Typed parquet sources; catalog scope publishes explores, attachment scope does not. */
export enum ExternalSourceType {
    CSV = 'csv',
    GOOGLE_SHEETS = 'google_sheets',
}

export enum ExternalSourceStatus {
    /** Uploaded and sniffed, awaiting the user's confirmation. */
    STAGED = 'staged',
    /** Ingest in progress (initial or refresh). */
    SYNCING = 'syncing',
    READY = 'ready',
    ERROR = 'error',
}

/** Controls whether a source is published into the project's Explore catalog. */
export enum ExternalSourceScope {
    CATALOG = 'catalog',
    ATTACHMENT = 'attachment',
}

export type ExternalSourceCsvConnection = {
    type: ExternalSourceType.CSV;
    originalFilename: string;
};

export type ExternalSourceGoogleSheetsConnection = {
    type: ExternalSourceType.GOOGLE_SHEETS;
    spreadsheetId: string;
    tabName: string | null;
};

export type ExternalSourceConnection =
    | ExternalSourceCsvConnection
    | ExternalSourceGoogleSheetsConnection;

export type ExternalSourceTable = {
    tableUuid: string;
    sourceUuid: string;
    name: string;
    label: string;
    columns: ResultColumns | null;
    rowCount: number | null;
    totalBytes: number | null;
    version: number;
    lastIngestedAt: Date | null;
};

export type ExternalSource = {
    sourceUuid: string;
    projectUuid: string;
    type: ExternalSourceType;
    scope: ExternalSourceScope;
    name: string;
    connection: ExternalSourceConnection;
    status: ExternalSourceStatus;
    errorMessage: string | null;
    createdByUserUuid: string | null;
    lastRefreshedAt: Date | null;
    tables: ExternalSourceTable[];
};

export const getExternalSourceDisplayName = (
    source: Pick<ExternalSource, 'connection' | 'name'>,
): string =>
    source.connection.type === ExternalSourceType.CSV
        ? source.connection.originalFilename
        : source.name;

/**
 * Back-reference stamped on explores generated from an external source table.
 * The source type is denormalized so the sidebar can pick an icon without
 * fetching the source list.
 */
export type ExternalSourceRef = {
    sourceUuid: string;
    tableUuid: string;
    sourceType: ExternalSourceType;
};

export type StagedExternalSourceUpload = {
    sourceUuid: string;
    inferredColumns: ResultColumns;
    sampleRows: Record<string, unknown>[];
    rowCountEstimate: number | null;
};

export type CreateExternalSourceTablePayload = {
    /** Required for catalog sources; attachments receive a private name. */
    tableName?: string;
    label?: string;
};

/** Rename changes how the table appears; the sql name stays stable so saved charts keep working. */
export type UpdateExternalSourcePayload = {
    label: string;
};

export type CreateGoogleSheetsSourcePayload = {
    url: string;
    tableName: string;
    label?: string;
    /** Sheet tab to read; the first tab when omitted. */
    tabName?: string;
};

export const parseGoogleSheetsSpreadsheetId = (
    url: string,
): string | undefined => url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];

export type ExternalSourceTablePreview = {
    columns: ResultColumns;
    sampleRows: Record<string, unknown>[];
};

export const MAX_EXTERNAL_SOURCE_FILE_BYTES = 100 * 1024 * 1024;

export type ApiExternalSourceResponse = {
    status: 'ok';
    results: ExternalSource;
};

export type ApiExternalSourcesResponse = {
    status: 'ok';
    results: ExternalSource[];
};

export type ApiStagedExternalSourceUploadResponse = {
    status: 'ok';
    results: StagedExternalSourceUpload;
};

export type ApiExternalSourceTablePreviewResponse = {
    status: 'ok';
    results: ExternalSourceTablePreview;
};
