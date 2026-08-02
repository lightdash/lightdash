import * as Excel from 'exceljs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { WorkbookExportHelper } from './WorkbookExportHelper';

const toArrayBuffer = (buffer: Buffer) =>
    buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

const createWorkbookBuffer = async (value: number) => {
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');
    worksheet.columns = [{ header: 'Amount', key: 'amount', width: 22 }];
    const row = worksheet.addRow({ amount: value });
    row.getCell(1).numFmt = '$#,##0.00';

    return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('WorkbookExportHelper', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('creates one workbook with safe sheets and counts failed files', async () => {
        const outputPath = path.join(
            os.tmpdir(),
            `lightdash-dashboard-workbook-${Date.now()}.xlsx`,
        );
        const firstBuffer = await createWorkbookBuffer(123.45);
        const secondBuffer = await createWorkbookBuffer(67.89);
        const fileErrors: Array<{ filename: string; error: string }> = [];

        global.fetch = vi.fn(async (url) => {
            if (url === 'first') {
                return {
                    ok: true,
                    arrayBuffer: async () => toArrayBuffer(firstBuffer),
                };
            }

            if (url === 'second') {
                return {
                    ok: true,
                    arrayBuffer: async () => toArrayBuffer(secondBuffer),
                };
            }

            return {
                ok: false,
                status: 404,
                statusText: 'Not Found',
            };
        }) as unknown as typeof fetch;

        try {
            const result = await WorkbookExportHelper.createWorkbookFile({
                files: [
                    {
                        filename: 'first',
                        sheetName:
                            'Revenue: by / customer ? segment * really long',
                        localPath: 'first',
                    },
                    {
                        filename: 'second',
                        sheetName:
                            'Revenue: by / customer ? segment * really long',
                        localPath: 'second',
                    },
                    {
                        filename: 'missing',
                        localPath: 'missing',
                    },
                ],
                outputPath,
                onFileError: (filename, error) =>
                    fileErrors.push({ filename, error }),
            });

            expect(result).toEqual({
                worksheetCount: 2,
                failedFileCount: 1,
            });
            expect(fileErrors).toEqual([
                { filename: 'missing', error: 'HTTP 404 Not Found' },
            ]);

            const workbook = new Excel.Workbook();
            await workbook.xlsx.readFile(outputPath);
            expect(workbook.worksheets).toHaveLength(2);
            expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
                'Revenue_ by _ customer _ segmen',
                'Revenue_ by _ customer _ segm_2',
            ]);
            expect(workbook.worksheets[0].getColumn(1).width).toBe(22);
            expect(workbook.worksheets[0].getCell('A2').numFmt).toBe(
                '$#,##0.00',
            );
        } finally {
            await fs.unlink(outputPath).catch(() => undefined);
        }
    });
});
