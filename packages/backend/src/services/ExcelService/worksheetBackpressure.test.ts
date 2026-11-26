import * as Excel from 'exceljs';
import { Writable } from 'node:stream';
import {
    getBufferedSheetBytes,
    waitForWorksheetDrain,
} from './worksheetBackpressure';

const ROWS = 20000;
const row = Array.from({ length: 50 }, (_, index) => `value ${index}`);

// A destination slower than the row loop, like a busy disk
const createSlowWorkbook = () => {
    const stream = new Writable({
        write(_chunk, _encoding, callback) {
            setImmediate(callback);
        },
    });
    const workbook = new Excel.stream.xlsx.WorkbookWriter({ stream });
    return { workbook, worksheet: workbook.addWorksheet('Sheet1') };
};

describe('waitForWorksheetDrain', () => {
    it('keeps unwritten sheet data bounded while rows are written', async () => {
        const { workbook, worksheet } = createSlowWorkbook();
        let maxBuffered = 0;

        for (let index = 0; index < ROWS; index += 1) {
            worksheet.addRow(row).commit();
            maxBuffered = Math.max(
                maxBuffered,
                getBufferedSheetBytes(worksheet),
            );
            // eslint-disable-next-line no-await-in-loop
            await waitForWorksheetDrain(worksheet);
        }
        worksheet.commit();
        await workbook.commit();

        expect(maxBuffered).toBeGreaterThan(0);
        expect(maxBuffered).toBeLessThan(2 * 1024 * 1024);
    });

    it('sees the data exceljs buffers when nothing waits for it', async () => {
        const { workbook, worksheet } = createSlowWorkbook();

        for (let index = 0; index < ROWS; index += 1) {
            worksheet.addRow(row).commit();
        }
        const buffered = getBufferedSheetBytes(worksheet);
        worksheet.commit();
        await workbook.commit();

        expect(buffered).toBeGreaterThan(8 * 1024 * 1024);
    });
});
