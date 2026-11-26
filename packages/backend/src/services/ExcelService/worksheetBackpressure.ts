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
 * exceljs ignores backpressure and output errors: rows committed faster than
 * the file is written pile up in memory, and a failed destination leaves the
 * writer waiting forever. This watches the workbook's output for both.
 */
export const createExcelWriteGuard = (
    workbook: Excel.stream.xlsx.WorkbookWriter,
    worksheet: Excel.Worksheet,
) => {
    const output = (workbook as unknown as { stream?: Writable }).stream;
    let failure: Error | undefined;
    let rejectFailed: (error: Error) => void = () => {};
    const failed = new Promise<never>((_, reject) => {
        rejectFailed = reject;
    });
    // Callers may never await `failed`; a failure still reaches them via waitForDrain
    failed.catch(() => {});
    const fail = (error: Error) => {
        if (!failure) {
            failure = error;
            rejectFailed(error);
        }
    };
    // Listeners stay attached so a late output error cannot go unhandled
    output?.on('error', fail);
    output?.on('close', () => {
        if (!output.writableFinished) {
            fail(new Error('Excel output closed before the export finished'));
        }
    });

    return {
        /** Rejects when the workbook's output fails or closes early. */
        failed,
        /**
         * Returns a promise to await while the sheet's output is backed up,
         * or undefined when it is safe to keep writing.
         */
        waitForDrain: (): Promise<void> | undefined => {
            if (failure) {
                return Promise.reject(failure);
            }
            if (getBufferedSheetBytes(worksheet) < MAX_BUFFERED_SHEET_BYTES) {
                return undefined;
            }
            const abort = new AbortController();
            const drained = Promise.all(
                getSheetPipes(worksheet).map((pipe) =>
                    once(pipe, 'drain', { signal: abort.signal }),
                ),
            );
            return Promise.race([drained, failed])
                .finally(() => abort.abort())
                .then(() => undefined);
        },
    };
};
