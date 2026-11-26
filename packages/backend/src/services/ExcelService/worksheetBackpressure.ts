import type * as Excel from 'exceljs';
import { once } from 'node:events';
import type { Writable } from 'node:stream';

// The zip stream exceljs writes sheet data into; older readable-stream builds
// only expose the buffered size on the internal state
type SheetPipe = Writable & { _writableState?: { length?: number } };

const MAX_BUFFERED_SHEET_BYTES = 1024 * 1024;

const getSheetPipes = (worksheet: Excel.Worksheet): SheetPipe[] =>
    (worksheet as unknown as { stream?: { pipes?: SheetPipe[] } }).stream
        ?.pipes ?? [];

export const getBufferedSheetBytes = (worksheet: Excel.Worksheet): number =>
    getSheetPipes(worksheet).reduce(
        (total, pipe) =>
            total + (pipe.writableLength ?? pipe._writableState?.length ?? 0),
        0,
    );

/**
 * exceljs ignores backpressure, so rows committed faster than the file is
 * written pile up in memory. Returns a promise to await while the sheet's
 * output is backed up, or undefined when it is safe to keep writing.
 */
export const waitForWorksheetDrain = (
    worksheet: Excel.Worksheet,
): Promise<void> | undefined => {
    if (getBufferedSheetBytes(worksheet) < MAX_BUFFERED_SHEET_BYTES) {
        return undefined;
    }
    return Promise.all(
        getSheetPipes(worksheet).map((pipe) => once(pipe, 'drain')),
    ).then(() => undefined);
};
