import { subject } from '@casl/ability';
import {
    Account,
    AnyType,
    ApiSqlQueryResults,
    DashboardFilters,
    DateGranularity,
    DownloadFileType,
    ExportCsvDashboardPayload,
    ForbiddenError,
    formatItemValue,
    formatRows,
    formatTemporalCellForSpreadsheet,
    friendlyName,
    getErrorMessage,
    getItemLabel,
    getItemLabelWithoutTableName,
    getItemMap,
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    ItemsMap,
    MetricQuery,
    MissingConfigError,
    ParameterError,
    PivotConfig,
    pivotResultsAsCsv,
    SCHEDULER_TASKS,
    SchedulerCsvOptions,
    SchedulerFormat,
    SessionUser,
} from '@lightdash/common';
import archiver from 'archiver';
import { stringify } from 'csv-stringify';
import * as fs from 'fs';
import * as fsPromise from 'fs/promises';
import isNil from 'lodash/isNil';
import moment from 'moment';
import { nanoid } from 'nanoid';
import {
    pipeline,
    Readable,
    Transform,
    TransformCallback,
    Writable,
} from 'stream';
import { StringDecoder } from 'string_decoder';
import {
    DownloadCsv,
    LightdashAnalytics,
    parseAnalyticsLimit,
} from '../../analytics/LightdashAnalytics';
import { AttachmentUrl } from '../../clients/EmailClient/EmailClient';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { UserModel } from '../../models/UserModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import {
    generateGenericFileId,
    isRowValueDate,
    isRowValueTimestamp,
    sanitizeGenericFileName,
    streamJsonlData,
} from '../../utils/FileDownloadUtils/FileDownloadUtils';
import { BaseService } from '../BaseService';
import { PersistentDownloadFileService } from '../PersistentDownloadFileService/PersistentDownloadFileService';
import { PivotTableService } from '../PivotTableService/PivotTableService';
import { ProjectService } from '../ProjectService/ProjectService';

type CsvServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectService: ProjectService;
    fileStorageClient: FileStorageClient;
    savedChartModel: SavedChartModel;
    savedSqlModel: SavedSqlModel;
    dashboardModel: DashboardModel;
    userModel: UserModel;
    downloadFileModel: DownloadFileModel;
    schedulerClient: SchedulerClient;
    projectModel: ProjectModel;
    pivotTableService: PivotTableService;
    persistentDownloadFileService: PersistentDownloadFileService;
};

export const convertSqlToCsv = (
    results: Pick<ApiSqlQueryResults, 'rows' | 'fields'>,
    customLabels: Record<string, string> = {},
): Promise<string> => {
    const csvHeader = Object.keys(results.rows[0]).map(
        (id) => customLabels[id] || friendlyName(id),
    );
    const csvBody = results?.rows.map((row) =>
        Object.values(results?.fields).map((field, fieldIndex) => {
            const rowValue = Object.values(row)[fieldIndex];

            if (isRowValueTimestamp(rowValue, field)) {
                return moment(rowValue).format('YYYY-MM-DD HH:mm:ss.SSS');
            }
            if (isRowValueDate(rowValue, field)) {
                return moment(rowValue).format('YYYY-MM-DD');
            }

            return Object.values(row)[fieldIndex];
        }),
    );
    return new Promise((resolve, reject) => {
        stringify(
            [csvHeader, ...csvBody],
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
};

export const getSchedulerCsvLimit = (
    options: SchedulerCsvOptions | undefined,
): number | null | undefined => {
    switch (options?.limit) {
        case 'table':
        case undefined:
            return undefined;
        case 'all':
            return null;
        default:
            // Custom
            return options?.limit;
    }
};

export class CsvService extends BaseService {
    // Helper method to escape CSV values
    private static escapeCsvValue(value: AnyType): string {
        if (value === null || value === undefined) return '';
        return `"${String(value).replace(/"/g, '""')}"`;
    }

    // Helper method to process a single JSON line to CSV
    private static processJsonLineToCsv(
        line: string,
        itemMap: ItemsMap,
        onlyRaw: boolean,
        sortedFieldIds: string[],
        timezone?: string,
    ): string | null {
        if (!line.trim()) return null;

        try {
            const jsonRow = JSON.parse(line.trim());
            const csvRow = CsvService.convertRowToCsv(
                jsonRow,
                itemMap,
                onlyRaw,
                sortedFieldIds,
                timezone,
            );

            return csvRow.map(CsvService.escapeCsvValue).join(',');
        } catch (error) {
            Logger.debug(`Skipping invalid JSON line: ${error}`);
            return null;
        }
    }

    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectService: ProjectService;

    fileStorageClient: FileStorageClient;

    savedChartModel: SavedChartModel;

    savedSqlModel: SavedSqlModel;

    dashboardModel: DashboardModel;

    userModel: UserModel;

    downloadFileModel: DownloadFileModel;

    schedulerClient: SchedulerClient;

    projectModel: ProjectModel;

    pivotTableService: PivotTableService;

    persistentDownloadFileService: PersistentDownloadFileService;

    constructor({
        lightdashConfig,
        analytics,
        userModel,
        projectService,
        fileStorageClient,
        savedChartModel,
        savedSqlModel,
        dashboardModel,
        downloadFileModel,
        schedulerClient,
        projectModel,
        pivotTableService,
        persistentDownloadFileService,
    }: CsvServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.userModel = userModel;
        this.projectService = projectService;
        this.fileStorageClient = fileStorageClient;
        this.savedChartModel = savedChartModel;
        this.savedSqlModel = savedSqlModel;
        this.dashboardModel = dashboardModel;
        this.downloadFileModel = downloadFileModel;
        this.schedulerClient = schedulerClient;
        this.projectModel = projectModel;
        this.pivotTableService = pivotTableService;
        this.persistentDownloadFileService = persistentDownloadFileService;
    }

    static convertRowToCsv(
        row: Record<string, AnyType>,
        itemMap: ItemsMap,
        onlyRaw: boolean,
        sortedFieldIds: string[],
        timezone?: string,
    ) {
        return sortedFieldIds.map((id: string) => {
            const data = row[id];
            const item = itemMap[id];

            if (data === null || data === undefined) {
                return data;
            }

            const spreadsheetTemporal = formatTemporalCellForSpreadsheet(
                item,
                data,
                timezone,
            );
            if (spreadsheetTemporal !== undefined) return spreadsheetTemporal;

            // Return raw value and let csv-stringify handle the rest
            if (onlyRaw) return data;

            // Use standard Lightdash formatting based on the item formatting configuration
            return formatItemValue(item, data, undefined, undefined, timezone);
        });
    }

    static generateFileId(
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

    static isValidCsvFileId(fileId: string): boolean {
        // Updated regex to allow Unicode characters, spaces, mixed case, and common punctuation
        // This matches our new sanitizeGenericFileName approach
        return /^csv-(incomplete_results-)?[^/\\:*?"<>|]+-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{4}\.csv$/.test(
            fileId,
        );
    }

    static async streamObjectRowsToFile(
        onlyRaw: boolean,
        itemMap: ItemsMap,
        sortedFieldIds: string[],
        csvHeader: string[],
        {
            readStream,
            writeStream,
        }: {
            readStream: Readable;
            writeStream: Writable;
        },
        timezone?: string,
    ): Promise<void> {
        // Create csv-stringify stringifier with clean configuration
        const stringifier = stringify({
            delimiter: ',',
            header: true,
            columns: csvHeader,
        });

        const rowTransformer = new Transform({
            objectMode: true,
            transform(
                chunk: AnyType,
                encoding: BufferEncoding,
                callback: TransformCallback,
            ) {
                const csvRow = CsvService.convertRowToCsv(
                    chunk,
                    itemMap,
                    onlyRaw,
                    sortedFieldIds,
                    timezone,
                );

                // Pass data to next stream in pipeline (csv-stringify)
                callback(null, csvRow);
            },
        });

        // Full pipeline - all streams connected with automatic backpressure
        return new Promise((resolve, reject) => {
            // Write BOM before starting the pipeline
            const bomBuffer = Buffer.from('\uFEFF', 'utf8');
            writeStream.write(bomBuffer);

            pipeline(
                readStream,
                rowTransformer,
                stringifier,
                writeStream,
                (err) => {
                    if (err) {
                        Logger.error(
                            `streamObjectRowsToFile: Pipeline error: ${getErrorMessage(
                                err,
                            )}`,
                        );
                        reject(err);
                        return;
                    }
                    resolve();
                },
            );
        });
    }

    /**
     * Stream JSONL data to CSV file with proper streaming patterns
     * Processes data row-by-row to minimize memory usage
     */
    static async streamJsonlRowsToFile(
        onlyRaw: boolean,
        itemMap: ItemsMap,
        sortedFieldIds: string[],
        csvHeader: string[],
        {
            readStream,
            writeStream,
        }: { readStream: Readable; writeStream: Writable },
        timezone?: string,
    ): Promise<{ truncated: boolean }> {
        return new Promise((resolve, reject) => {
            // Write CSV header with BOM immediately
            const headerWithBOM = Buffer.concat([
                Buffer.from('\uFEFF', 'utf8'),
                Buffer.from(`${csvHeader.join(',')}\n`, 'utf8'),
            ]);
            writeStream.write(headerWithBOM);

            // StringDecoder preserves multibyte UTF-8 characters across chunk boundaries
            const decoder = new StringDecoder('utf8');
            let lineBuffer = '';
            let rowCount = 0;

            // Handle backpressure: resume reading when write buffer drains
            writeStream.on('drain', () => {
                readStream.resume();
            });

            readStream.on('data', (chunk: Buffer) => {
                lineBuffer += decoder.write(chunk);
                const lines = lineBuffer.split('\n');

                // Keep last incomplete line in buffer
                lineBuffer = lines.pop() || '';

                // Process complete lines with backpressure handling
                for (const line of lines) {
                    const csvString = CsvService.processJsonLineToCsv(
                        line,
                        itemMap,
                        onlyRaw,
                        sortedFieldIds,
                        timezone,
                    );

                    if (csvString) {
                        const canContinue = writeStream.write(`${csvString}\n`);
                        rowCount += 1;

                        // If write buffer is full, pause reading until it drains
                        if (!canContinue) {
                            readStream.pause();
                        }
                    }
                }
            });

            readStream.on('end', () => {
                // Flush any remaining bytes from decoder
                lineBuffer += decoder.end();

                // Process any remaining line in buffer
                const csvString = CsvService.processJsonLineToCsv(
                    lineBuffer,
                    itemMap,
                    onlyRaw,
                    sortedFieldIds,
                    timezone,
                );

                if (csvString) {
                    writeStream.write(`${csvString}\n`);
                    rowCount += 1;
                }

                Logger.debug(
                    `streamJsonlRowsToFile: Processed ${rowCount} rows successfully`,
                );
                resolve({ truncated: false });
            });

            readStream.on('error', (error) => {
                Logger.error(
                    'streamJsonlRowsToFile: Read stream error:',
                    error,
                );
                reject(error);
            });
        });
    }

    static async writeRowsToFile(
        rows: Record<string, AnyType>[],
        onlyRaw: boolean,
        metricQuery: MetricQuery,
        itemMap: ItemsMap,
        showTableNames: boolean,
        fileName: string,
        truncated: boolean,
        customLabels: Record<string, string> = {},
        columnOrder: string[] = [],
        hiddenFields: string[] = [],
    ): Promise<string> {
        // Ignore fields from results that are not selected in metrics or dimensions
        const selectedFieldIds = [
            ...metricQuery.metrics,
            ...metricQuery.dimensions,
            ...metricQuery.tableCalculations.map((tc: AnyType) => tc.name),
        ].filter((id) => !hiddenFields.includes(id));

        Logger.debug(
            `writeRowsToFile with ${rows.length} rows and ${selectedFieldIds.length} columns`,
        );

        const fileId = CsvService.generateFileId(fileName, truncated);
        const writeStream = fs.createWriteStream(`/tmp/${fileId}`);

        const sortedFieldIds = isNil(rows[0])
            ? []
            : Object.keys(rows[0])
                  .filter((id) => selectedFieldIds.includes(id))
                  .sort(
                      (a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b),
                  );

        const csvHeader = sortedFieldIds.map((id) => {
            if (customLabels[id]) {
                return customLabels[id];
            }
            if (itemMap[id]) {
                return showTableNames
                    ? getItemLabel(itemMap[id])
                    : getItemLabelWithoutTableName(itemMap[id]);
            }
            return id;
        });

        // Increasing CHUNK_SIZE increases memory usage, but increases speed of CSV generation
        const CHUNK_SIZE = 50000;
        const readStream = Readable.from(rows, {
            objectMode: true,
            highWaterMark: CHUNK_SIZE,
        });

        await CsvService.streamObjectRowsToFile(
            onlyRaw,
            itemMap,
            sortedFieldIds,
            csvHeader,
            {
                readStream,
                writeStream,
            },
        );

        return fileId;
    }

    couldBeTruncated(rows: Record<string, AnyType>[]) {
        if (rows.length === 0) return false;

        const numberRows = rows.length;
        const numberColumns = Object.keys(rows[0]).length;

        // we use floor when limiting the rows, so the  need to make sure we got the last row valid
        const cellsLimit = this.lightdashConfig.query?.csvCellsLimit || 100000;

        return numberRows * numberColumns >= cellsLimit - numberColumns;
    }

    public async downloadCsvFile({
        csvContent,
        fileName,
        projectUuid,
        truncated = false,
        organizationUuid,
        createdByUserUuid,
    }: {
        csvContent: string;
        fileName: string;
        projectUuid: string;
        truncated?: boolean;
        organizationUuid: string;
        createdByUserUuid: string | null;
    }): Promise<AttachmentUrl> {
        const fileId = CsvService.generateFileId(fileName, truncated);
        const filePath = `/tmp/${fileId}`;
        const csvWithBOM = Buffer.concat([
            Buffer.from('\uFEFF', 'utf8'),
            Buffer.from(csvContent, 'utf8'),
        ]);
        await fsPromise.writeFile(filePath, csvWithBOM);

        if (this.fileStorageClient.isEnabled()) {
            await this.fileStorageClient.uploadCsv(csvContent, fileId);

            // Delete local file in 10 minutes, we could still read from the local file to upload to google sheets
            setTimeout(
                async () => {
                    try {
                        await fsPromise.unlink(filePath);
                    } catch (error) {
                        this.logger.warn(
                            `Error deleting local file ${filePath}: ${error}`,
                        );
                    }
                },
                60 * 10 * 1000,
            );

            const url =
                await this.persistentDownloadFileService.createPersistentUrl({
                    s3Key: fileId,
                    fileType: DownloadFileType.CSV,
                    organizationUuid,
                    projectUuid,
                    createdByUserUuid,
                });
            return {
                filename: fileName,
                path: url,
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

    /**
     * This method is used to schedule a CSV download for a dashboard.
     */
    async scheduleExportCsvDashboard(
        account: Account,
        dashboardUuid: string,
        dashboardFilters: DashboardFilters,
        selectedTabs: string[] | null,
        dateZoomGranularity?: DateGranularity | string,
    ) {
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('ExportCsv', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const payload: ExportCsvDashboardPayload = {
            dashboardUuid,
            dashboardFilters,
            dateZoomGranularity,
            selectedTabs,
            // TraceTaskBase
            organizationUuid: dashboard.organizationUuid,
            projectUuid: dashboard.projectUuid,
            userUuid: account.user.id,
            schedulerUuid: undefined,
        };
        const { jobId } = await this.schedulerClient.scheduleTask(
            SCHEDULER_TASKS.EXPORT_CSV_DASHBOARD,
            payload,
        );

        return { jobId };
    }
}
