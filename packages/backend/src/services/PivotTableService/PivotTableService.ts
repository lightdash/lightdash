import {
    AnyType,
    DownloadFileType,
    formatRows,
    getErrorMessage,
    ItemsMap,
    MetricQuery,
    MissingConfigError,
    PivotConfig,
    pivotResultsAsCsv,
} from '@lightdash/common';
import { stringify } from 'csv-stringify';
import * as fs from 'fs';
import * as fsPromise from 'fs/promises';
import moment from 'moment';
import { nanoid } from 'nanoid';
import { Readable } from 'stream';
import { S3Client } from '../../clients/Aws/S3Client';
import { AttachmentUrl } from '../../clients/EmailClient/EmailClient';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import {
    generateGenericFileId,
    streamJsonlData,
} from '../../utils/FileDownloadUtils/FileDownloadUtils';
import { BaseService } from '../BaseService';

type PivotTableServiceArguments = {
    lightdashConfig: LightdashConfig;
    s3Client: S3Client;
    downloadFileModel: DownloadFileModel;
};

export class PivotTableService extends BaseService {
    lightdashConfig: LightdashConfig;

    s3Client: S3Client;

    downloadFileModel: DownloadFileModel;

    constructor({
        lightdashConfig,
        s3Client,
        downloadFileModel,
    }: PivotTableServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.s3Client = s3Client;
        this.downloadFileModel = downloadFileModel;
    }

    /**
     * Generates a file ID for CSV files
     */
    private static generateFileId(
        fileName: string,
        truncated: boolean = false,
        time: moment.Moment = moment(),
    ): string {
        return generateGenericFileId({
            fileName,
            fileExtension: DownloadFileType.CSV,
            truncated,
            time,
        });
    }

    /**
     * Checks if the rows could be truncated based on cell limit
     */
    private couldBeTruncated(rows: Record<string, AnyType>[]) {
        if (rows.length === 0) return false;

        const numberRows = rows.length;
        const numberColumns = Object.keys(rows[0]).length;

        // we use floor when limiting the rows, so the need to make sure we got the last row valid
        const cellsLimit = this.lightdashConfig.query?.csvCellsLimit || 100000;

        return numberRows * numberColumns >= cellsLimit - numberColumns;
    }

    /**
     * Downloads pivot table CSV from async query results file
     * Handles loading data from JSONL storage file and generating pivot CSV
     */
    async downloadAsyncPivotTableCsv({
        resultsFileName,
        fields,
        metricQuery,
        projectUuid,
        storageClient,
        options,
    }: {
        resultsFileName: string;
        fields: ItemsMap;
        metricQuery: MetricQuery;
        projectUuid: string;
        storageClient: S3ResultsFileStorageClient;
        options: {
            onlyRaw: boolean;
            showTableNames: boolean;
            customLabels: Record<string, string>;
            columnOrder: string[];
            hiddenFields: string[];
            pivotConfig: PivotConfig;
            attachmentDownloadName?: string;
        };
    }): Promise<{ fileUrl: string; truncated: boolean }> {
        const {
            onlyRaw,
            showTableNames,
            customLabels,
            columnOrder,
            hiddenFields,
            pivotConfig,
        } = options;

        // Load rows from the results file using shared streaming utility
        // Use the same logic as regular CSV exports - respect csvCellsLimit with field count
        const readStream = await storageClient.getDowloadStream(
            resultsFileName,
        );

        const fieldCount = Object.keys(fields).length;
        const cellsLimit = this.lightdashConfig.query?.csvCellsLimit || 100000;

        // Use standard csvCellsLimit calculation - same as original downloadPivotTableCsv
        const maxRows = Math.floor(cellsLimit / fieldCount);

        const { results: rows, truncated } = await streamJsonlData<
            Record<string, unknown>
        >({
            readStream,
            onRow: (parsedRow: Record<string, unknown>) => parsedRow, // Just collect all rows
            maxLines: maxRows, // Use standard csvCellsLimit logic
        });

        if (rows.length === 0) {
            throw new Error('No data found in results file');
        }

        // Use same truncation logic as original downloadPivotTableCsv
        const finalTruncated = truncated || this.couldBeTruncated(rows);

        if (finalTruncated) {
            Logger.warn(
                `Pivot CSV export truncated: loaded ${rows.length} rows (csvCellsLimit: ${cellsLimit}, fieldCount: ${fieldCount})`,
            );
        }

        const fileName =
            options.attachmentDownloadName || `pivot-${resultsFileName}`;

        const attachmentUrl = await this.downloadPivotTableCsv({
            name: fileName,
            projectUuid,
            rows,
            itemMap: fields,
            metricQuery,
            pivotConfig,
            exploreId: metricQuery.exploreName || 'explore',
            onlyRaw,
            truncated: finalTruncated,
            customLabels,
        });

        return {
            fileUrl: attachmentUrl.path,
            truncated: finalTruncated,
        };
    }

    /**
     * Downloads pivot table CSV and returns the final CSV result as a string
     * This method can be memory intensive
     */
    async downloadPivotTableCsv({
        name,
        projectUuid,
        rows,
        itemMap,
        metricQuery,
        pivotConfig,
        exploreId,
        onlyRaw,
        truncated,
        customLabels,
    }: {
        name?: string;
        projectUuid: string;
        rows: Record<string, AnyType>[];
        itemMap: ItemsMap;
        metricQuery: MetricQuery;
        pivotConfig: PivotConfig;
        exploreId: string;
        onlyRaw: boolean;
        truncated: boolean;
        customLabels: Record<string, string> | undefined;
        metricsAsRows?: boolean;
    }): Promise<AttachmentUrl> {
        // PivotQueryResults expects a formatted ResultRow[] type, so we need to convert it first
        // TODO: refactor pivotQueryResults to accept a Record<string, any>[] simple row type for performance
        const formattedRows = formatRows(rows, itemMap);

        const csvResults = pivotResultsAsCsv({
            pivotConfig,
            rows: formattedRows,
            itemMap,
            metricQuery,
            customLabels,
            onlyRaw,
            maxColumnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
        });

        const csvContent = await new Promise<string>((resolve, reject) => {
            stringify(
                csvResults,
                {
                    delimiter: ',',
                },
                (err, output) => {
                    if (err) {
                        reject(new Error(getErrorMessage(err)));
                    }
                    resolve(output);
                },
            );
        });

        return this.downloadCsvFile({
            csvContent,
            fileName: name || exploreId,
            projectUuid,
            truncated,
        });
    }

    /**
     * Downloads a CSV file to S3 or local storage
     */
    private async downloadCsvFile({
        csvContent,
        fileName,
        projectUuid,
        truncated = false,
    }: {
        csvContent: string;
        fileName: string;
        projectUuid: string;
        truncated?: boolean;
    }): Promise<AttachmentUrl> {
        const fileId = PivotTableService.generateFileId(fileName, truncated);
        const filePath = `/tmp/${fileId}`;
        const csvWithBOM = Buffer.concat([
            Buffer.from('\uFEFF', 'utf8'),
            Buffer.from(csvContent, 'utf8'),
        ]);
        await fsPromise.writeFile(filePath, csvWithBOM);

        if (this.s3Client.isEnabled()) {
            const s3Url = await this.s3Client.uploadCsv(csvContent, fileId);

            // Delete local file in 10 minutes, we could still read from the local file to upload to google sheets
            setTimeout(async () => {
                await fsPromise.unlink(filePath);
            }, 60 * 10 * 1000);

            return {
                filename: fileName,
                path: s3Url,
                localPath: filePath,
                truncated,
            };
        }

        // storing locally
        const downloadFileId = nanoid();
        await this.downloadFileModel.createDownloadFile(
            downloadFileId,
            filePath,
            DownloadFileType.CSV,
        );

        const localUrl = new URL(
            `/api/v1/projects/${projectUuid}/csv/${downloadFileId}`,
            this.lightdashConfig.siteUrl,
        ).href;

        return {
            filename: fileName,
            path: localUrl,
            localPath: filePath,
            truncated,
        };
    }
}
