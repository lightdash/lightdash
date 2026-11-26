import * as Excel from 'exceljs';
import { Writable } from 'node:stream';
import {
    createExcelWriteGuard,
    getBufferedSheetBytes,
} from './worksheetBackpressure';

const ROWS = 20000;
const row = Array.from({ length: 50 }, (_, index) => `value ${index}`);

const createWorkbook = (stream: Writable) => {
    const workbook = new Excel.stream.xlsx.WorkbookWriter({ stream });
    const worksheet = workbook.addWorksheet('Sheet1');
    return {
        workbook,
        worksheet,
        guard: createExcelWriteGuard(workbook, worksheet),
    };
};

// A destination slower than the row loop, like a busy disk
const createSlowOutput = () =>
    new Writable({
        write(_chunk, _encoding, callback) {
            setImmediate(callback);
        },
    });

const writeAllRows = async (
    worksheet: Excel.Worksheet,
    guard: ReturnType<typeof createExcelWriteGuard>,
) => {
    for (let index = 0; index < ROWS; index += 1) {
        worksheet.addRow(row).commit();
        // eslint-disable-next-line no-await-in-loop
        await guard.waitForDrain();
    }
};

describe('createExcelWriteGuard', () => {
    it('keeps unwritten sheet data bounded while rows are written', async () => {
        const { workbook, worksheet, guard } =
            createWorkbook(createSlowOutput());
        let maxBuffered = 0;

        for (let index = 0; index < ROWS; index += 1) {
            worksheet.addRow(row).commit();
            maxBuffered = Math.max(
                maxBuffered,
                getBufferedSheetBytes(worksheet),
            );
            // eslint-disable-next-line no-await-in-loop
            await guard.waitForDrain();
        }
        worksheet.commit();
        await workbook.commit();

        expect(maxBuffered).toBeGreaterThan(0);
        expect(maxBuffered).toBeLessThan(2 * 1024 * 1024);
    });

    it('sees the data exceljs buffers when nothing waits for it', async () => {
        const { workbook, worksheet } = createWorkbook(createSlowOutput());

        for (let index = 0; index < ROWS; index += 1) {
            worksheet.addRow(row).commit();
        }
        const buffered = getBufferedSheetBytes(worksheet);
        worksheet.commit();
        await workbook.commit();

        expect(buffered).toBeGreaterThan(8 * 1024 * 1024);
    });

    it('rejects the drain wait when the output fails', async () => {
        const diskFull = Object.assign(new Error('ENOSPC: no space left'), {
            code: 'ENOSPC',
        });
        let writes = 0;
        const { worksheet, guard } = createWorkbook(
            new Writable({
                write(_chunk, _encoding, callback) {
                    writes += 1;
                    setImmediate(callback, writes > 3 ? diskFull : null);
                },
            }),
        );

        await expect(writeAllRows(worksheet, guard)).rejects.toBe(diskFull);
        await expect(guard.failed).rejects.toBe(diskFull);
        // Later rows fail straight away instead of waiting again
        await expect(guard.waitForDrain()).rejects.toBe(diskFull);
    });

    it('rejects the drain wait when the output closes early', async () => {
        const output = createSlowOutput();
        const { worksheet, guard } = createWorkbook(output);
        setTimeout(() => output.destroy(), 20);

        await expect(writeAllRows(worksheet, guard)).rejects.toThrow(
            'Excel output closed before the export finished',
        );
    });
});
