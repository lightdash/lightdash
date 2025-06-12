import { type PivotConfig } from './pivot';

export enum DownloadFileType {
    CSV = 'csv',
    IMAGE = 'image',
    JSONL = 'jsonl',
    S3_JSONL = 's3_jsonl',
    XLSX = 'xlsx',
}

export type DownloadFile = {
    nanoid: string;
    path: string;
    createdAt: Date;
    type: DownloadFileType;
};

/**
 * Backwards compatible options for downloading query results
 */
export type DownloadOptions = {
    fileType?: DownloadFileType;
    onlyRaw?: boolean;
    showTableNames?: boolean;
    customLabels?: Record<string, string>;
    columnOrder?: string[];
    hiddenFields?: string[];
    pivotConfig?: PivotConfig;
    attachmentDownloadName?: string;
};
