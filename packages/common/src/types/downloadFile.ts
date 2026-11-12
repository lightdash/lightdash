import { type ConditionalFormattingConfig } from './conditionalFormatting';
import { type PivotConfig } from './pivot';

export enum DownloadFileType {
    CSV = 'csv',
    IMAGE = 'image',
    JSONL = 'jsonl',
    S3_JSONL = 's3_jsonl',
    XLSX = 'xlsx',
}

/**
 * What an XLSX export of a saved chart contains: the query's data rows, or a
 * rendered image of the visualization. Only non-table charts offer the image.
 */
export enum XlsxExportContent {
    DATA = 'data',
    CHART_IMAGE = 'chart_image',
}

export type DownloadFile = {
    nanoid: string;
    path: string;
    createdAt: Date;
    type: DownloadFileType;
    projectUuid: string | null;
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
    exportPivotedData?: boolean;
    attachmentDownloadName?: string;
    conditionalFormattings?: ConditionalFormattingConfig[];
    // Table chart "Show column total" — appends a warehouse-computed totals row
    // to unpivoted exports. Pivoted exports carry it in `pivotConfig`.
    showColumnTotals?: boolean;
    // XLSX only. Defaults to data rows; CHART_IMAGE embeds a rendered image
    // of the saved chart the query belongs to instead.
    xlsxContent?: XlsxExportContent;
};
