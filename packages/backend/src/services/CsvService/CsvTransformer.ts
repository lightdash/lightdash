import {
    AnyType,
    DimensionType,
    formatItemValue,
    getErrorMessage,
    isField,
    ItemsMap,
} from '@lightdash/common';
import moment from 'moment';
import { Readable, Writable } from 'stream';
import Logger from '../../logging/logger';

export class CsvTransformer {
    /**
     * Helper method to escape CSV values
     */
    static escapeCsvValue(value: AnyType): string {
        if (value === null || value === undefined) return '';
        return `"${String(value).replace(/"/g, '""')}"`;
    }

    /**
     * Helper method to process a single JSON line to CSV
     */
    static processJsonLineToCsv(
        line: string,
        itemMap: ItemsMap,
        onlyRaw: boolean,
        sortedFieldIds: string[],
    ): string | null {
        if (!line.trim()) return null;

        try {
            const jsonRow = JSON.parse(line.trim());
            const csvRow = CsvTransformer.convertRowToCsv(
                jsonRow,
                itemMap,
                onlyRaw,
                sortedFieldIds,
            );

            return csvRow.map(CsvTransformer.escapeCsvValue).join(',');
        } catch (error) {
            Logger.debug(`Skipping invalid JSON line: ${error}`);
            return null;
        }
    }

    /**
     * Convert a single row to CSV format
     */
    static convertRowToCsv(
        row: Record<string, AnyType>,
        itemMap: ItemsMap,
        onlyRaw: boolean,
        sortedFieldIds: string[],
    ) {
        return sortedFieldIds.map((id: string) => {
            const data = row[id];
            const item = itemMap[id];

            if (data === null || data === undefined) {
                return data;
            }

            const itemIsField = isField(item);
            if (itemIsField && item.type === DimensionType.TIMESTAMP) {
                return moment(data).format('YYYY-MM-DD HH:mm:ss.SSS');
            }
            if (itemIsField && item.type === DimensionType.DATE) {
                return moment(data).format('YYYY-MM-DD');
            }

            // Return raw value and let csv-stringify handle the rest
            if (onlyRaw) return data;

            // Use standard Lightdash formatting based on the item formatting configuration
            return formatItemValue(item, data);
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
    ): Promise<{ truncated: boolean }> {
        return new Promise((resolve, reject) => {
            // Write CSV header with BOM immediately
            const headerWithBOM = Buffer.concat([
                Buffer.from('\uFEFF', 'utf8'),
                Buffer.from(`${csvHeader.join(',')}\n`, 'utf8'),
            ]);
            writeStream.write(headerWithBOM);

            let lineBuffer = '';
            let rowCount = 0;

            readStream.on('data', (chunk: Buffer) => {
                lineBuffer += chunk.toString();
                const lines = lineBuffer.split('\n');

                // Keep last incomplete line in buffer
                lineBuffer = lines.pop() || '';

                // Process complete lines
                for (const line of lines) {
                    const csvString = CsvTransformer.processJsonLineToCsv(
                        line,
                        itemMap,
                        onlyRaw,
                        sortedFieldIds,
                    );

                    if (csvString) {
                        writeStream.write(`${csvString}\n`);
                        rowCount += 1;
                    }
                }
            });

            readStream.on('end', () => {
                // Process any remaining line in buffer
                const csvString = CsvTransformer.processJsonLineToCsv(
                    lineBuffer,
                    itemMap,
                    onlyRaw,
                    sortedFieldIds,
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
}
