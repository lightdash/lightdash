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
import * as Excel from 'exceljs';
import moment from 'moment';
import { createInterface } from 'readline';
import { Readable, Writable } from 'stream';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { generateGenericFileId } from '../../utils/FileDownloadUtils';

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
        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Sheet1');

        // Add headers
        worksheet.addRow(excelHeaders);

        // Style headers
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' },
        };

        // Use shared streaming utility
        const { truncated } = await ExcelService.streamJsonlData({
            readStream,
            onRow: (parsedRow, lineCount) => {
                const excelRow = ExcelService.convertRowToExcel(
                    parsedRow,
                    itemMap,
                    onlyRaw,
                    sortedFieldIds,
                );
                worksheet.addRow(excelRow);

                // Auto-adjust column widths every 1000 rows for performance
                const rowIndex = lineCount + 1; // +1 because headers are row 1
                if (rowIndex % 1000 === 0) {
                    worksheet.columns.forEach((column, index) => {
                        if (column && excelHeaders[index]) {
                            const headerLength = excelHeaders[index].length;
                            // eslint-disable-next-line no-param-reassign
                            column.width = Math.max(
                                column.width || 0,
                                headerLength + 2,
                                15,
                            );
                        }
                    });
                }
            },
            onComplete: async () => {
                // Final column width adjustment
                worksheet.columns.forEach((column, index) => {
                    if (column && excelHeaders[index]) {
                        const headerLength = excelHeaders[index].length;
                        // eslint-disable-next-line no-param-reassign
                        column.width = Math.max(
                            column.width || 0,
                            headerLength + 2,
                            15,
                        );
                    }
                });

                // Write to stream
                await workbook.xlsx.write(writeStream);
                writeStream.end();
            },
        });

        return { truncated };
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

        const fileName = `pivot-${resultsFileName}`;
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
}
