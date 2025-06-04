import {
    AnyType,
    DimensionType,
    DownloadFileType,
    formatItemValue,
    formatRows,
    ItemsMap,
    MetricQuery,
    PivotConfig,
    pivotResultsAsCsv,
} from '@lightdash/common';
import * as Excel from 'exceljs';
import moment from 'moment';
import { createInterface } from 'readline';
import { Readable, Writable } from 'stream';
import Logger from '../../logging/logger';
import {
    generateGenericFileId,
    isRowValueDate,
    isRowValueTimestamp,
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

            if (!onlyRaw && item) {
                return formatItemValue(item, rawValue);
            }

            // Handle date/timestamp conversion for Excel
            if (
                isRowValueTimestamp(rawValue, { type: DimensionType.TIMESTAMP })
            ) {
                return moment(rawValue).toDate();
            }
            if (isRowValueDate(rawValue, { type: DimensionType.DATE })) {
                return moment(rawValue).toDate();
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

        return new Promise((resolve, reject) => {
            // Process the readStream line by line
            const lineReader = createInterface({
                input: readStream,
                crlfDelay: Infinity,
            });

            let lineCount = 0;
            const MAX_LINES = 100000; // Configurable limit - Excel has ~1M row limit
            let truncated = false;
            let rowIndex = 2; // Start after header

            lineReader.on('line', (line: string) => {
                if (!line.trim()) return;

                // eslint-disable-next-line no-plusplus
                lineCount++;
                if (lineCount > MAX_LINES) {
                    truncated = true;
                    lineReader.close();
                    return;
                }

                try {
                    const parsedRow = JSON.parse(line);
                    const excelRow = ExcelService.convertRowToExcel(
                        parsedRow,
                        itemMap,
                        onlyRaw,
                        sortedFieldIds,
                    );
                    worksheet.addRow(excelRow);

                    // Auto-adjust column widths every 1000 rows for performance
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

                    // eslint-disable-next-line no-plusplus
                    rowIndex++;
                } catch (error) {
                    Logger.error(
                        `Error processing line ${lineCount}: ${error}`,
                    );
                }
            });

            lineReader.on('close', async () => {
                try {
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
                    resolve({ truncated });
                } catch (error) {
                    reject(error);
                }
            });

            lineReader.on('error', (error) => {
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
        fileName,
        maxColumnLimit,
    }: {
        rows: Record<string, AnyType>[];
        itemMap: ItemsMap;
        metricQuery: MetricQuery;
        pivotConfig: PivotConfig;
        onlyRaw: boolean;
        customLabels: Record<string, string> | undefined;
        fileName: string;
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
}
