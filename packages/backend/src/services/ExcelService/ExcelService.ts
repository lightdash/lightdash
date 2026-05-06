import {
    AnyType,
    DimensionType,
    DownloadFileType,
    formatItemValue,
    formatRows,
    getErrorMessage,
    getFormatExpression,
    isDimension,
    isField,
    isNumber,
    ItemsMap,
    MetricQuery,
    PivotConfig,
    pivotResultsAsCsv,
    pivotResultsAsData,
    ResultRow,
    timeIntervalToExcelNumFmt,
    toExcelWallClockDate,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import * as Excel from 'exceljs';
import fs from 'fs';
import moment from 'moment';
import os from 'os';
import path from 'path';
import { Readable, Writable } from 'stream';
import { transformAndExportResults } from '../../clients/Aws/transformAndExportResults';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
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

    private static isTzActive(
        timezone: string | undefined,
    ): timezone is string {
        return !!timezone && timezone !== 'UTC';
    }

    /**
     * TIMESTAMP fields and TIMESTAMP-base DATE intervals carry a real
     * instant — both shift into the project zone. DATE fields whose base is
     * DATE (or unset) are calendar values and stay put: shifting would
     * cross day boundaries on non-zero offsets. Mirrors the rule in
     * `CsvService.convertRowToCsv`.
     */
    private static isShiftableDateField(
        item: ItemsMap[string] | undefined,
    ): boolean {
        if (!isField(item)) return false;
        if (item.type === DimensionType.TIMESTAMP) return true;
        return (
            item.type === DimensionType.DATE &&
            isDimension(item) &&
            item.timeIntervalBaseDimensionType === DimensionType.TIMESTAMP
        );
    }

    static convertToExcelDate(
        value: unknown,
        timezone?: string,
    ): Date | unknown {
        if (typeof value === 'string') {
            const dateValue = moment(value, moment.ISO_8601, true);
            if (dateValue.isValid()) {
                // Bare date strings (no 'T') skip the shift to keep calendar values.
                if (ExcelService.isTzActive(timezone) && value.includes('T')) {
                    return toExcelWallClockDate(value, timezone);
                }
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
        timezone?: string,
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

            if (
                isItemField &&
                (item.type === DimensionType.DATE ||
                    item.type === DimensionType.TIMESTAMP)
            ) {
                if (
                    ExcelService.isTzActive(timezone) &&
                    ExcelService.isShiftableDateField(item)
                ) {
                    return toExcelWallClockDate(rawValue, timezone);
                }
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
            return formatItemValue(
                item,
                rawValue,
                undefined,
                undefined,
                timezone,
            );
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
        enableImprovedExcelDates = false,
        timezone,
    }: {
        rows: Record<string, AnyType>[];
        itemMap: ItemsMap;
        metricQuery: MetricQuery;
        pivotConfig: PivotConfig;
        onlyRaw: boolean;
        customLabels: Record<string, string> | undefined;
        maxColumnLimit: number;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        enableImprovedExcelDates?: boolean;
        timezone?: string;
    }): Promise<Excel.Buffer> {
        const formattedRows = formatRows(
            rows,
            itemMap,
            undefined,
            undefined,
            timezone,
        );

        if (!enableImprovedExcelDates) {
            return ExcelService.downloadPivotTableXlsxLegacy({
                formattedRows,
                itemMap,
                metricQuery,
                pivotConfig,
                onlyRaw,
                customLabels,
                maxColumnLimit,
                pivotDetails,
                timezone,
            });
        }

        const pivotData = pivotResultsAsData({
            pivotConfig,
            rows: formattedRows,
            itemMap,
            metricQuery,
            customLabels,
            onlyRaw,
            maxColumnLimit,
            pivotDetails,
        });

        // Build date column metadata: for each data column, determine if
        // it's a date/timestamp dimension and what Excel numFmt to apply.
        const dateColumnFormats = new Map<
            number,
            {
                numFmt: string;
                shouldShift: boolean;
            }
        >();
        if (!onlyRaw) {
            const tzActive = ExcelService.isTzActive(timezone);
            pivotData.fieldIds.forEach((fieldId, colIndex) => {
                const field = itemMap[fieldId];
                if (
                    field &&
                    isField(field) &&
                    isDimension(field) &&
                    (field.type === DimensionType.DATE ||
                        field.type === DimensionType.TIMESTAMP)
                ) {
                    const numFmt = timeIntervalToExcelNumFmt(
                        field.timeInterval,
                        field.type,
                    );
                    if (numFmt) {
                        const offset = pivotData.hasIndex ? 0 : 1;
                        dateColumnFormats.set(colIndex + offset, {
                            numFmt,
                            shouldShift:
                                tzActive &&
                                ExcelService.isShiftableDateField(field),
                        });
                    }
                }
            });
        }

        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Pivot Table');

        // Add header rows
        pivotData.headers.forEach((row, rowIndex) => {
            worksheet.addRow(row);

            if (rowIndex === 0) {
                const headerRow = worksheet.getRow(1);
                headerRow.font = { bold: true };
                headerRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE0E0E0' },
                };
            }
        });

        // Add data rows — use raw values for date columns, formatted for everything else
        pivotData.dataRows.forEach((row) => {
            const excelRow = row.map((cell, colIndex) => {
                const dateFmt = dateColumnFormats.get(colIndex);
                if (
                    dateFmt &&
                    cell.raw != null &&
                    cell.raw !== '' &&
                    typeof cell.raw === 'string'
                ) {
                    const m = moment.utc(cell.raw);
                    if (m.isValid()) {
                        return dateFmt.shouldShift && timezone
                            ? toExcelWallClockDate(cell.raw, timezone)
                            : m.toDate();
                    }
                }
                return cell.formatted;
            });
            const wsRow = worksheet.addRow(excelRow);

            // Apply numFmt to date cells in this row
            dateColumnFormats.forEach(({ numFmt }, colIndex) => {
                const cell = wsRow.getCell(colIndex + 1); // 1-indexed
                if (cell.value instanceof Date) {
                    cell.numFmt = numFmt;
                }
            });
        });

        // Auto-adjust column widths
        const allRows = [
            ...pivotData.headers,
            ...pivotData.dataRows.map((row) => row.map((c) => c.formatted)),
        ];
        worksheet.columns.forEach((column, index) => {
            if (column) {
                let maxLength = 0;
                allRows.forEach((row) => {
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

    private static async downloadPivotTableXlsxLegacy({
        formattedRows,
        itemMap,
        metricQuery,
        pivotConfig,
        onlyRaw,
        customLabels,
        maxColumnLimit,
        pivotDetails,
        timezone,
    }: {
        formattedRows: ResultRow[];
        itemMap: ItemsMap;
        metricQuery: MetricQuery;
        pivotConfig: PivotConfig;
        onlyRaw: boolean;
        customLabels: Record<string, string> | undefined;
        maxColumnLimit: number;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        timezone?: string;
    }): Promise<Excel.Buffer> {
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

        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Pivot Table');

        csvResults.forEach((row, index) => {
            const excelRow = row.map((value) =>
                ExcelService.convertToExcelDate(value, timezone),
            );
            worksheet.addRow(excelRow);

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
        timezone,
    }: {
        resultsFileName: string;
        fields: ItemsMap;
        metricQuery: MetricQuery;
        resultsStorageClient: S3ResultsFileStorageClient;
        exportsStorageClient: FileStorageClient;
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
        timezone?: string;
    }): Promise<{ fileUrl: string; truncated: boolean; s3Key: string }> {
        const { onlyRaw, customLabels, pivotConfig, attachmentDownloadName } =
            options;

        // Load rows from the results file using shared streaming utility
        // For pivot tables, we need to use csvCellsLimit to prevent memory issues
        const readStream =
            await resultsStorageClient.getDownloadStream(resultsFileName);

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
            enableImprovedExcelDates: lightdashConfig.enableImprovedExcelDates,
            timezone,
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
        timezone?: string,
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
                    timezone,
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
            exportsStorageClient: FileStorageClient;
        },
        options: {
            onlyRaw?: boolean;
            showTableNames?: boolean;
            customLabels?: Record<string, string>;
            columnOrder?: string[];
            hiddenFields?: string[];
            attachmentDownloadName?: string;
        } = {},
        timezone?: string,
    ): Promise<{ fileUrl: string; truncated: boolean; s3Key: string }> {
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
            const resultsStream =
                await resultsStorageClient.getDownloadStream(resultsFileName);

            // Step 2: Stream JSONL data to Excel temp file
            const { truncated } = await ExcelService.streamJsonlToExcelFile(
                resultsStream,
                tempFilePath,
                headers,
                fields,
                onlyRaw,
                sortedFieldIds,
                timezone,
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
                s3Key: formattedFileName,
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
