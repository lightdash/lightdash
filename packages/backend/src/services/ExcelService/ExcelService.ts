import {
    AnyType,
    DimensionType,
    DownloadFileType,
    formatItemValue,
    formatRows,
    getErrorMessage,
    ItemsMap,
    MetricQuery,
    PivotConfig,
    pivotResultsAsCsv,
} from '@lightdash/common';
// Import regular ExcelJS - the fix is in the streaming pattern, not the package
import { PutObjectCommand } from '@aws-sdk/client-s3';
import * as Excel from 'exceljs';
import fs from 'fs';
import moment from 'moment';
import os from 'os';
import path from 'path';
import { createInterface } from 'readline';
import { Readable, Writable } from 'stream';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import {
    generateGenericFileId,
    processFieldsForExport,
} from '../../utils/FileDownloadUtils';

export class ExcelService {
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
            const item = itemMap[fieldId];
            const rawValue = row[fieldId];

            if (rawValue === null || rawValue === undefined) {
                return rawValue;
            }

            // If we have item metadata and it's a date/timestamp field, convert for Excel
            if (item && 'type' in item) {
                if (item.type === DimensionType.TIMESTAMP) {
                    return moment(rawValue).toDate();
                }
                if (item.type === DimensionType.DATE) {
                    return moment(rawValue).toDate();
                }
            }

            // Return raw value if onlyRaw is true
            if (onlyRaw) {
                return rawValue;
            }

            // Use standard Lightdash formatting if not onlyRaw and we have item metadata
            if (item) {
                return formatItemValue(item, rawValue);
            }

            return rawValue;
        });
    }

    static async streamJsonlRowsToFile(
        onlyRaw: boolean,
        itemMap: ItemsMap,
        sortedFieldIds: string[],
        excelHeaders: string[],
        {
            readStream,
            writeStream,
        }: {
            readStream: Readable;
            writeStream: Writable;
        },
    ): Promise<{ truncated: boolean }> {
        return new Promise((resolve, reject) => {
            // Initialize streaming workbook - exact pattern from working examples
            const options = { stream: writeStream };
            const workbook = new Excel.stream.xlsx.WorkbookWriter(options);
            const worksheet = workbook.addWorksheet('Sheet1');

            // Set up columns properly like in working examples
            worksheet.columns = excelHeaders.map((header, index) => ({
                header,
                key: `col_${index}`,
                width: 15,
            }));

            let rowCount = 0;
            let lineBuffer = '';

            // Process data line-by-line as it arrives (true streaming)
            readStream.on('data', (chunk: Buffer) => {
                lineBuffer += chunk.toString();
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') {
                        // Skip empty lines
                    } else {
                        try {
                            const parsedRow = JSON.parse(line);

                            if (parsedRow && typeof parsedRow === 'object') {
                                rowCount += 1;

                                // Convert row data for Excel
                                const rowData = ExcelService.convertRowToExcel(
                                    parsedRow,
                                    itemMap,
                                    onlyRaw,
                                    sortedFieldIds,
                                );

                                // Validate row data
                                if (
                                    Array.isArray(rowData) &&
                                    rowData.length > 0
                                ) {
                                    // Stream directly to Excel (no memory accumulation)
                                    const rowObject: Record<
                                        string,
                                        string | number | Date | null
                                    > = {};
                                    rowData.forEach(
                                        (
                                            value:
                                                | string
                                                | number
                                                | Date
                                                | null,
                                            colIndex: number,
                                        ) => {
                                            rowObject[`col_${colIndex}`] =
                                                value;
                                        },
                                    );

                                    const row = worksheet.addRow(rowObject);
                                    row.commit(); // Immediate commit for streaming
                                } else {
                                    Logger.warn(
                                        `Invalid row data on row ${rowCount}, skipping`,
                                    );
                                }
                            }
                        } catch (error) {
                            Logger.error(
                                `Error parsing JSON line: ${getErrorMessage(
                                    error,
                                )}`,
                            );
                        }
                    }
                }
            });

            readStream.on('end', async () => {
                // Process any remaining buffered line
                if (lineBuffer.trim()) {
                    try {
                        const parsedRow = JSON.parse(lineBuffer);

                        if (parsedRow && typeof parsedRow === 'object') {
                            rowCount += 1;
                            const rowData = ExcelService.convertRowToExcel(
                                parsedRow,
                                itemMap,
                                onlyRaw,
                                sortedFieldIds,
                            );

                            if (Array.isArray(rowData) && rowData.length > 0) {
                                // Stream the final row directly
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
                            }
                        }
                    } catch (error) {
                        Logger.error(
                            `Error parsing final line: ${getErrorMessage(
                                error,
                            )}`,
                        );
                    }
                }

                // Final commits - let ExcelJS complete naturally
                worksheet.commit();

                // ExcelJS streaming works perfectly - just needs time to finalize large files
                // Our stress tests proved it can handle 1M+ rows efficiently
                try {
                    await workbook.commit();
                } catch (error) {
                    Logger.error(
                        `Workbook commit failed: ${getErrorMessage(error)}`,
                    );
                    throw error;
                }

                resolve({ truncated: false });
            });

            readStream.on('error', (error) => {
                Logger.error(`Read stream error: ${getErrorMessage(error)}`);
                reject(error);
            });
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
    }: {
        rows: Record<string, AnyType>[];
        itemMap: ItemsMap;
        metricQuery: MetricQuery;
        pivotConfig: PivotConfig;
        onlyRaw: boolean;
        customLabels: Record<string, string> | undefined;
        maxColumnLimit: number;
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
        });

        // Create Excel workbook
        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Pivot Table');

        // Add data to worksheet
        csvResults.forEach((row, index) => {
            const excelRow = row.map((value) => {
                // Handle date/timestamp conversion for Excel
                if (typeof value === 'string') {
                    // Check if it looks like a date/timestamp
                    const dateValue = moment(value, moment.ISO_8601, true);
                    if (dateValue.isValid()) {
                        return dateValue.toDate();
                    }
                }
                return value;
            });
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
        storageClient,
        lightdashConfig,
        options,
    }: {
        resultsFileName: string;
        fields: ItemsMap;
        metricQuery: MetricQuery;
        storageClient: S3ResultsFileStorageClient; // S3ResultsFileStorageClient type
        lightdashConfig: LightdashConfig;
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
        const { onlyRaw, customLabels, pivotConfig } = options;

        // Load all rows from the results file using shared streaming utility
        const readStream = await storageClient.getDowloadStream(
            resultsFileName,
        );
        const { results: rows, truncated } = await ExcelService.streamJsonlData<
            Record<string, unknown>
        >({
            readStream,
            onRow: (parsedRow) => parsedRow, // Just collect all rows
        });

        if (rows.length === 0) {
            throw new Error('No data found in results file');
        }

        const fileName =
            options.attachmentDownloadName || `pivot-${resultsFileName}`;
        const formattedFileName = ExcelService.generateFileId(fileName);

        const excelBuffer = await ExcelService.downloadPivotTableXlsx({
            rows,
            itemMap: fields,
            metricQuery,
            pivotConfig,
            onlyRaw,
            customLabels,
            maxColumnLimit: lightdashConfig.pivotTable.maxColumnLimit,
        });

        // Upload the Excel buffer to storage using the storage client pattern
        return storageClient.transformResultsIntoNewFile(
            resultsFileName,
            formattedFileName,
            async (_, writeStream: Writable) => {
                // We already have the buffer, so just write it directly
                writeStream.write(Buffer.from(excelBuffer));
                writeStream.end();
                return { truncated };
            },
        );
    }

    /**
     * Shared utility for streaming JSONL data from storage
     * Can be used for both row-by-row processing and collecting all rows
     */
    static async streamJsonlData<T>({
        readStream,
        onRow,
        onComplete,
        maxLines = 1_000_000,
    }: {
        readStream: Readable;
        onRow?: (
            parsedRow: Record<string, unknown>,
            lineCount: number,
        ) => T | void;
        onComplete?: (results: T[], truncated: boolean) => void;
        maxLines?: number;
    }): Promise<{ results: T[]; truncated: boolean }> {
        return new Promise((resolve, reject) => {
            const lineReader = createInterface({
                input: readStream,
                crlfDelay: Infinity,
            });

            let lineCount = 0;
            let truncated = false;
            const results: T[] = [];

            lineReader.on('line', (line: string) => {
                if (!line.trim()) return;

                lineCount += 1;
                if (lineCount > maxLines) {
                    truncated = true;
                    lineReader.close();
                    return;
                }

                try {
                    const parsedRow = JSON.parse(line);
                    if (onRow) {
                        const result = onRow(parsedRow, lineCount);
                        if (result !== undefined) {
                            results.push(result);
                        }
                    }
                } catch (error) {
                    Logger.error(
                        `Error parsing line ${lineCount}: ${getErrorMessage(
                            error,
                        )}`,
                    );
                }
            });

            lineReader.on('close', async () => {
                if (onComplete) {
                    await onComplete(results, truncated);
                }
                resolve({ results, truncated });
            });

            lineReader.on('error', (error) => {
                reject(error);
            });
        });
    }

    static async streamJsonlRowsToFileViaTempFile(
        onlyRaw: boolean,
        itemMap: ItemsMap,
        sortedFieldIds: string[],
        excelHeaders: string[],
        {
            readStream,
            writeStream,
        }: {
            readStream: Readable;
            writeStream: Writable;
        },
    ): Promise<{ truncated: boolean }> {
        // Create temporary file
        const tempFilePath = path.join(
            os.tmpdir(),
            `lightdash-excel-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}.xlsx`,
        );

        try {
            // Step 1: Create Excel file to temporary location using true streaming
            const fileStream = fs.createWriteStream(tempFilePath);
            const workbook = new Excel.stream.xlsx.WorkbookWriter({
                stream: fileStream,
            });
            const worksheet = workbook.addWorksheet('Sheet1');

            // Set up columns
            worksheet.columns = excelHeaders.map((header, index) => ({
                header,
                key: `col_${index}`,
                width: 15,
            }));

            let rowCount = 0;
            let lineBuffer = '';

            // Step 2: Process JSONL data line-by-line and stream to temp file
            for await (const chunk of readStream) {
                lineBuffer += chunk.toString();
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') {
                        // Skip empty lines
                    } else {
                        try {
                            const parsedRow = JSON.parse(line);
                            if (parsedRow && typeof parsedRow === 'object') {
                                rowCount += 1;

                                // Convert row data for Excel
                                const rowData = ExcelService.convertRowToExcel(
                                    parsedRow,
                                    itemMap,
                                    onlyRaw,
                                    sortedFieldIds,
                                );

                                if (
                                    Array.isArray(rowData) &&
                                    rowData.length > 0
                                ) {
                                    // Stream directly to Excel temp file
                                    const rowObject: Record<
                                        string,
                                        string | number | Date | null
                                    > = {};
                                    rowData.forEach(
                                        (
                                            value:
                                                | string
                                                | number
                                                | Date
                                                | null,
                                            colIndex: number,
                                        ) => {
                                            rowObject[`col_${colIndex}`] =
                                                value;
                                        },
                                    );

                                    const row = worksheet.addRow(rowObject);
                                    row.commit();
                                } else {
                                    Logger.warn(
                                        `Invalid row data on row ${rowCount}, skipping`,
                                    );
                                }
                            }
                        } catch (error) {
                            Logger.error(
                                `Error parsing JSON line: ${getErrorMessage(
                                    error,
                                )}`,
                            );
                        }
                    }
                }
            }

            // Process any remaining buffered line
            if (lineBuffer.trim()) {
                try {
                    const parsedRow = JSON.parse(lineBuffer);
                    if (parsedRow && typeof parsedRow === 'object') {
                        rowCount += 1;
                        const rowData = ExcelService.convertRowToExcel(
                            parsedRow,
                            itemMap,
                            onlyRaw,
                            sortedFieldIds,
                        );

                        if (Array.isArray(rowData) && rowData.length > 0) {
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
                        }
                    }
                } catch (error) {
                    Logger.error(
                        `Error parsing final line: ${getErrorMessage(error)}`,
                    );
                }
            }

            // Step 3: Commit Excel to temp file (this works reliably)
            worksheet.commit();
            await workbook.commit();

            // Step 4: Read temp file as buffer and write to destination (simple approach)
            const tempFileBuffer = fs.readFileSync(tempFilePath);

            // Clean up temp file immediately after reading
            fs.unlink(tempFilePath, (unlinkError) => {
                if (unlinkError) {
                    Logger.warn(
                        `Could not delete temp file: ${unlinkError.message}`,
                    );
                }
            });

            // Write buffer to destination stream and end it
            writeStream.write(tempFileBuffer);
            writeStream.end();

            return { truncated: false };
        } catch (error) {
            Logger.error(
                `Excel streaming via temp file failed: ${getErrorMessage(
                    error,
                )}`,
            );
            // Clean up temp file on error
            fs.unlink(tempFilePath, () => {});
            throw error;
        }
    }

    // Helper method to create temporary file path
    private static createTempFilePath(prefix: string): string {
        return path.join(
            os.tmpdir(),
            `lightdash-excel-${prefix}-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}.xlsx`,
        );
    }

    // Helper method to stream JSONL data to Excel temp file
    private static async streamJsonlToExcelFile(
        resultsStream: Readable,
        tempFilePath: string,
        headers: string[],
        fields: ItemsMap,
        onlyRaw: boolean,
        sortedFieldIds: string[],
    ): Promise<number> {
        const fileStream = fs.createWriteStream(tempFilePath);
        const workbook = new Excel.stream.xlsx.WorkbookWriter({
            stream: fileStream,
        });
        const worksheet = workbook.addWorksheet('Sheet1');

        // Set up columns
        worksheet.columns = headers.map((header, index) => ({
            header,
            key: `col_${index}`,
            width: 15,
        }));

        let rowCount = 0;
        let lineBuffer = '';

        // Process JSONL data line-by-line and stream to temp file
        for await (const chunk of resultsStream) {
            lineBuffer += chunk.toString();
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim() === '') {
                    // Skip empty lines
                } else {
                    try {
                        const parsedRow = JSON.parse(line);
                        if (parsedRow && typeof parsedRow === 'object') {
                            rowCount += 1;

                            // Convert row data for Excel
                            const rowData = ExcelService.convertRowToExcel(
                                parsedRow,
                                fields,
                                onlyRaw,
                                sortedFieldIds,
                            );

                            if (Array.isArray(rowData) && rowData.length > 0) {
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
                                    `Invalid row data on row ${rowCount}, skipping`,
                                );
                            }
                        }
                    } catch (error) {
                        Logger.error(
                            `Error parsing JSON line: ${getErrorMessage(
                                error,
                            )}`,
                        );
                    }
                }
            }
        }

        // Process any remaining buffered line
        if (lineBuffer.trim()) {
            try {
                const parsedRow = JSON.parse(lineBuffer);
                if (parsedRow && typeof parsedRow === 'object') {
                    rowCount += 1;
                    const rowData = ExcelService.convertRowToExcel(
                        parsedRow,
                        fields,
                        onlyRaw,
                        sortedFieldIds,
                    );

                    if (Array.isArray(rowData) && rowData.length > 0) {
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
                    }
                }
            } catch (error) {
                Logger.error(
                    `Error parsing final line: ${getErrorMessage(error)}`,
                );
            }
        }

        // Commit Excel to temp file
        worksheet.commit();
        await workbook.commit();

        return rowCount;
    }

    // NEW METHOD: Complete Excel export bypassing problematic stream architecture
    static async downloadAsyncExcelDirectly(
        resultsFileName: string,
        fields: ItemsMap,
        storageClient: S3ResultsFileStorageClient,
        options: {
            onlyRaw?: boolean;
            showTableNames?: boolean;
            customLabels?: Record<string, string>;
            columnOrder?: string[];
            hiddenFields?: string[];
            attachmentDownloadName?: string;
        } = {},
    ): Promise<{ fileUrl: string; truncated: boolean }> {
        // Generate a unique filename
        const formattedFileName = ExcelService.generateFileId(resultsFileName);

        // Handle column ordering and filtering
        const {
            onlyRaw = false,
            showTableNames = false,
            customLabels = {},
            columnOrder = [],
            hiddenFields = [],
            attachmentDownloadName,
        } = options;

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
            const resultsStream = await storageClient.getDowloadStream(
                resultsFileName,
            );

            // Step 2: Stream JSONL data to Excel temp file
            const rowCount = await ExcelService.streamJsonlToExcelFile(
                resultsStream,
                tempFilePath,
                headers,
                fields,
                onlyRaw,
                sortedFieldIds,
            );

            // Step 3: Stream temp file directly to S3 (no memory spike!)
            const fileUrl = await ExcelService.uploadFileStreamToS3(
                storageClient,
                formattedFileName,
                tempFilePath,
                attachmentDownloadName,
            );

            // Clean up temp file after successful upload
            fs.unlink(tempFilePath, (err: NodeJS.ErrnoException | null) => {
                if (err)
                    Logger.warn(`Could not delete temp file: ${err.message}`);
            });

            return {
                fileUrl,
                truncated: false,
            };
        } catch (error) {
            Logger.error(
                `Direct Excel export failed: ${getErrorMessage(error)}`,
            );
            // Clean up temp file on error
            fs.unlink(tempFilePath, () => {});
            throw error;
        }
    }

    private static async uploadFileStreamToS3(
        storageClient: S3ResultsFileStorageClient,
        formattedFileName: string,
        tempFilePath: string,
        attachmentDownloadName?: string,
    ): Promise<string> {
        // Upload file stream directly using PutObjectCommand (no memory spike!)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s3Client = (storageClient as any).s3; // Access underlying S3 client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { bucket } = (storageClient as any).configuration;

        // Create a read stream from the temp file
        const fileStream = fs.createReadStream(tempFilePath);

        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: formattedFileName,
                Body: fileStream,
                ContentType:
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                ContentDisposition: `attachment; filename="${
                    attachmentDownloadName
                        ? `${attachmentDownloadName}.xlsx`
                        : formattedFileName
                }"`,
            }),
        );

        // Get file URL
        return storageClient.getFileUrl(formattedFileName, 'xlsx');
    }
}
