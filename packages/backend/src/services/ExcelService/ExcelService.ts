import {
    AnyType,
    DimensionType,
    DownloadFileType,
    formatItemValue,
    formatRows,
    getErrorMessage,
    getFormatExpression,
    isField,
    isNumber,
    ItemsMap,
    MetricQuery,
    PivotConfig,
    pivotResultsAsCsv,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import * as Excel from 'exceljs';
import fs from 'fs';
import moment from 'moment';
import os from 'os';
import path from 'path';
import { Readable, Writable } from 'stream';
import { S3Client } from '../../clients/Aws/S3Client';
import { transformAndExportResults } from '../../clients/Aws/transformAndExportResults';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import {
    generateGenericFileId,
    processFieldsForExport,
    streamJsonlData,
} from '../../utils/FileDownloadUtils/FileDownloadUtils';

export class ExcelService {
    private static readonly EXCEL_ROW_LIMIT = 1_000_000;

    // Helper method for date/timestamp conversion
    static convertToExcelDate(value: unknown): Date | unknown {
        if (typeof value === 'string') {
            const dateValue = moment(value, moment.ISO_8601, true);
            if (dateValue.isValid()) {
                return dateValue.toDate();
            }
        }
        return value;
    }

    static generateFileId(
        fileName: string,
        truncated: boolean = false,
        time: moment.Moment = moment(),
    ): string {
        return generateGenericFileId({
            fileName,
            fileExtension: DownloadFileType.XLSX,
            truncated,
            time,
        });
    }

    static convertRowToExcel(
        row: Record<string, AnyType>,
        itemMap: ItemsMap,
        onlyRaw: boolean,
        sortedFieldIds: string[],
    ): (string | number | Date | null)[] {
        return sortedFieldIds.map((fieldId) => {
            const rawValue = row[fieldId];

            if (onlyRaw) {
                return rawValue;
            }

            if (rawValue === null || rawValue === undefined) {
                return rawValue;
            }

            const item = itemMap[fieldId];
            const isItemField = isField(item);

            // For date/timestamp fields with custom formatting, convert to Date object first
            if (
                isItemField &&
                (item.type === DimensionType.DATE ||
                    item.type === DimensionType.TIMESTAMP)
            ) {
                return moment(rawValue).toDate();
            }

            const stringValue = String(rawValue);

            // If the string value is empty, return the raw value
            if (stringValue.trim() === '') {
                return rawValue;
            }

            // Convert string numbers to actual numbers for Excel formatting
            // When there is a formatExpression, the formatting is applied at the column level
            // so we need to convert the raw value to a number
            if (isNumber(rawValue)) {
                return Number(stringValue);
            }

            // Otherwise, use standard Lightdash formatting as there won't be a format expression
            return formatItemValue(item, rawValue);
        });
    }

    static async downloadPivotTableXlsx({
        rows,
        itemMap,
        metricQuery,
        pivotConfig,
        onlyRaw,
        customLabels,
        maxColumnLimit,
        pivotDetails,
    }: {
        rows: Record<string, AnyType>[];
        itemMap: ItemsMap;
        metricQuery: MetricQuery;
        pivotConfig: PivotConfig;
        onlyRaw: boolean;
        customLabels: Record<string, string> | undefined;
        maxColumnLimit: number;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
    }): Promise<Excel.Buffer> {
        // PivotQueryResults expects a formatted ResultRow[] type, so we need to convert it first
        const formattedRows = formatRows(rows, itemMap);

        const csvResults = pivotResultsAsCsv({
            pivotConfig,
            rows: formattedRows,
            itemMap,
            metricQuery,
            customLabels,
            onlyRaw,
            maxColumnLimit,
            pivotDetails,
        });

        // Create Excel workbook
        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Pivot Table');

        // Add data to worksheet
        csvResults.forEach((row, index) => {
            const excelRow = row.map((value) =>
                ExcelService.convertToExcelDate(value),
            );
            worksheet.addRow(excelRow);

            // Style headers (first row)
            if (index === 0) {
                const headerRow = worksheet.getRow(1);
                headerRow.font = { bold: true };
                headerRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE0E0E0' },
                };
            }
        });

        // Auto-adjust column widths
        worksheet.columns.forEach((column, index) => {
            if (column) {
                let maxLength = 0;
                csvResults.forEach((row) => {
                    if (
                        row[index] &&
                        row[index].toString().length > maxLength
                    ) {
                        maxLength = row[index].toString().length;
                    }
                });
                // eslint-disable-next-line no-param-reassign
                column.width = Math.min(Math.max(maxLength + 2, 10), 50);
            }
        });

        // Write to buffer
        return workbook.xlsx.writeBuffer();
    }

    /**
     * Downloads pivot table XLSX from async query results file
     * Handles loading data from JSONL storage file and generating pivot Excel file
     */
    static async downloadAsyncPivotTableXlsx({
        resultsFileName,
        fields,
        metricQuery,
        resultsStorageClient,
        exportsStorageClient,
        lightdashConfig,
        options,
        pivotDetails,
    }: {
        resultsFileName: string;
        fields: ItemsMap;
        metricQuery: MetricQuery;
        resultsStorageClient: S3ResultsFileStorageClient;
        exportsStorageClient: S3Client;
        lightdashConfig: LightdashConfig;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
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
        const { onlyRaw, customLabels, pivotConfig, attachmentDownloadName } =
            options;

        // Load rows from the results file using shared streaming utility
        // For pivot tables, we need to use csvCellsLimit to prevent memory issues
        const readStream = await resultsStorageClient.getDownloadStream(
            resultsFileName,
        );

        const fieldCount = Object.keys(fields).length;
        const cellsLimit = lightdashConfig.query?.csvCellsLimit || 100000;

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

        if (truncated) {
            Logger.warn(
                `Pivot Excel export truncated: loaded ${rows.length} rows (csvCellsLimit: ${cellsLimit}, fieldCount: ${fieldCount})`,
            );
        }

        const fileName = attachmentDownloadName || `pivot-${resultsFileName}`;
        const formattedFileName = ExcelService.generateFileId(
            fileName,
            truncated,
        );

        const excelBuffer = await ExcelService.downloadPivotTableXlsx({
            rows,
            itemMap: fields,
            metricQuery,
            pivotConfig,
            onlyRaw,
            customLabels,
            maxColumnLimit: lightdashConfig.pivotTable.maxColumnLimit,
            pivotDetails,
        });

        // Upload the Excel buffer to exports bucket using cross-bucket transform
        return transformAndExportResults(
            resultsFileName,
            formattedFileName,
            async (_, writeStream: Writable) => {
                // We already have the buffer, so just write it directly
                writeStream.write(Buffer.from(excelBuffer));
                writeStream.end();
                return { truncated };
            },
            {
                resultsStorageClient,
                exportsStorageClient,
            },
            {
                fileType: DownloadFileType.XLSX,
                attachmentDownloadName: attachmentDownloadName
                    ? `${attachmentDownloadName}.xlsx`
                    : undefined,
            },
        );
    }

    // Helper method to create temporary file path
    private static createTempFilePath(prefix: string): string {
        return path.join(
            os.tmpdir(),
            `lightdash-excel-${prefix}-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 11)}.xlsx`,
        );
    }

    // Helper method to clean up temporary files
    private static cleanupTempFile(tempFilePath: string): void {
        fs.unlink(tempFilePath, (err: NodeJS.ErrnoException | null) => {
            if (err) {
                Logger.warn(`Could not delete temp file: ${err.message}`);
            }
        });
    }

    // Helper method to stream JSONL data to Excel temp file
    private static async streamJsonlToExcelFile(
        resultsStream: Readable,
        tempFilePath: string,
        headers: string[],
        fields: ItemsMap,
        onlyRaw: boolean,
        sortedFieldIds: string[],
    ): Promise<{ truncated: boolean }> {
        // Use the same approach as our working tests - direct filename instead of stream
        const workbook = new Excel.stream.xlsx.WorkbookWriter({
            filename: tempFilePath,
            useStyles: true,
            useSharedStrings: true,
        });
        const worksheet = workbook.addWorksheet('Sheet1');

        // Set up columns with formatting
        worksheet.columns = headers.map((header, index) => {
            const fieldId = sortedFieldIds[index];
            const item = fields[fieldId];
            const formatExpression = getFormatExpression(item);

            const column: Partial<Excel.Column> = {
                header,
                key: `col_${index}`,
                width: 15,
            };

            // Apply number formatting at column level if available
            if (formatExpression && !onlyRaw) {
                column.style = { numFmt: formatExpression };
            }

            return column;
        });

        let actualRowCount = 0;

        // Use streamJsonlData for clean line processing with automatic truncation
        const { truncated } = await streamJsonlData<void>({
            readStream: resultsStream,
            onRow: (parsedRow: Record<string, unknown>, lineCount: number) => {
                // Convert row data for Excel
                const rowData = ExcelService.convertRowToExcel(
                    parsedRow,
                    fields,
                    onlyRaw,
                    sortedFieldIds,
                );

                if (Array.isArray(rowData) && rowData.length > 0) {
                    actualRowCount += 1;

                    // Stream directly to Excel temp file
                    const rowObject: Record<
                        string,
                        string | number | Date | null
                    > = {};
                    rowData.forEach(
                        (
                            value: string | number | Date | null,
                            colIndex: number,
                        ) => {
                            rowObject[`col_${colIndex}`] = value;
                        },
                    );

                    const row = worksheet.addRow(rowObject);
                    row.commit();
                } else {
                    Logger.warn(
                        `Invalid row data on row ${lineCount}, skipping`,
                    );
                }
                // Return void since we're processing rows directly
            },
            maxLines: ExcelService.EXCEL_ROW_LIMIT,
        });

        // Commit Excel to temp file
        worksheet.commit();
        await workbook.commit();

        return { truncated };
    }

    /**
     * Direct Excel export using streaming to minimize memory usage
     * Processes JSONL data row-by-row and streams directly to S3
     */
    static async downloadAsyncExcelDirectly(
        resultsFileName: string,
        fields: ItemsMap,
        clients: {
            resultsStorageClient: S3ResultsFileStorageClient;
            exportsStorageClient: S3Client;
        },
        options: {
            onlyRaw?: boolean;
            showTableNames?: boolean;
            customLabels?: Record<string, string>;
            columnOrder?: string[];
            hiddenFields?: string[];
            attachmentDownloadName?: string;
        } = {},
    ): Promise<{ fileUrl: string; truncated: boolean }> {
        // Handle column ordering and filtering
        const {
            onlyRaw = false,
            showTableNames = false,
            customLabels = {},
            columnOrder = [],
            hiddenFields = [],
            attachmentDownloadName,
        } = options;

        const { resultsStorageClient, exportsStorageClient } = clients;

        // Process fields and generate headers using shared utility
        const { sortedFieldIds, headers } = processFieldsForExport(fields, {
            showTableNames,
            customLabels,
            columnOrder,
            hiddenFields,
        });

        // Create temporary file
        const tempFilePath = ExcelService.createTempFilePath('direct');

        try {
            // Step 1: Get source stream
            const resultsStream = await resultsStorageClient.getDownloadStream(
                resultsFileName,
            );

            // Step 2: Stream JSONL data to Excel temp file
            const { truncated } = await ExcelService.streamJsonlToExcelFile(
                resultsStream,
                tempFilePath,
                headers,
                fields,
                onlyRaw,
                sortedFieldIds,
            );

            // Generate filename with truncated flag
            const formattedFileName = ExcelService.generateFileId(
                resultsFileName,
                truncated,
            );

            // Step 3: Upload temp file to exports bucket (not results bucket)
            const fileStream = fs.createReadStream(tempFilePath);
            const fileUrl = await exportsStorageClient.uploadExcel(
                fileStream,
                formattedFileName,
                attachmentDownloadName
                    ? `${attachmentDownloadName}.xlsx`
                    : undefined,
            );

            return {
                fileUrl,
                truncated,
            };
        } catch (error) {
            Logger.error(
                `Direct Excel export failed: ${getErrorMessage(error)}`,
            );
            throw error;
        } finally {
            // Always clean up temp file, regardless of success or failure
            ExcelService.cleanupTempFile(tempFilePath);
        }
    }
}
