import {
    AnyType,
    DimensionType,
    formatItemValue,
    isMomentInput,
    ItemsMap,
} from '@lightdash/common';
import * as Excel from 'exceljs';
import moment, { MomentInput } from 'moment';
import { createInterface } from 'readline';
import { Readable, Writable } from 'stream';
import Logger from '../../logging/logger';

const isRowValueTimestamp = (
    value: unknown,
    field: { type: DimensionType },
): value is MomentInput =>
    isMomentInput(value) && field.type === DimensionType.TIMESTAMP;

const isRowValueDate = (
    value: unknown,
    field: { type: DimensionType },
): value is MomentInput =>
    isMomentInput(value) && field.type === DimensionType.DATE;

export class ExcelService {
    static sanitizeFileName(name: string): string {
        return name.replace(/[/\\?%*:|"<>]/g, '');
    }

    static generateFileId(
        fileName: string,
        truncated: boolean = false,
        time: moment.Moment = moment(),
    ): string {
        const timeFormat = time.format('YYYY-MM-DD-HH-mm-ss-SSS');
        const truncatedText = truncated ? '-truncated' : '';
        return `${ExcelService.sanitizeFileName(
            fileName,
        )}-${timeFormat}${truncatedText}.xlsx`;
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
}
