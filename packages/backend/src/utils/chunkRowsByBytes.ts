/** Bound a chunk by bytes as well as rows. The same 1,000 rows are 46 MB in one project and
 *  230 MB in another, so a row count alone does not bound anything. */
export const DEFAULT_CHUNK_MAX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_CHUNK_MAX_ROWS = 1000;

export type SizedRow<R> = { row: R; bytes: number };

/**
 * Group rows into chunks bounded by total bytes and by row count.
 *
 * Takes an iterable so the caller can serialise lazily: a generator that stringifies one row at
 * a time lets each chunk be built, inserted and released without ever holding every row.
 *
 * A single row larger than `maxBytes` is emitted on its own rather than dropped or merged.
 *
 * Each chunk carries its own byte total, so a caller never measures the rows a second time.
 */
export function* chunkRowsByBytes<R>(
    rows: Iterable<SizedRow<R>>,
    maxBytes: number = DEFAULT_CHUNK_MAX_BYTES,
    maxRows: number = DEFAULT_CHUNK_MAX_ROWS,
): Generator<{ rows: R[]; bytes: number }, void, undefined> {
    const byteLimit = Math.max(1, maxBytes);
    const rowLimit = Math.max(1, maxRows);
    let current: R[] = [];
    let currentBytes = 0;

    // eslint-disable-next-line no-restricted-syntax
    for (const { row, bytes } of rows) {
        const wouldExceed =
            current.length > 0 &&
            (currentBytes + bytes > byteLimit || current.length >= rowLimit);
        if (wouldExceed) {
            yield { rows: current, bytes: currentBytes };
            current = [];
            currentBytes = 0;
        }
        current.push(row);
        currentBytes += bytes;
    }
    if (current.length > 0) {
        yield { rows: current, bytes: currentBytes };
    }
}

export async function* chunkAsyncRowsByBytes<R>(
    rows: AsyncIterable<SizedRow<R>>,
    maxBytes: number = DEFAULT_CHUNK_MAX_BYTES,
    maxRows: number = DEFAULT_CHUNK_MAX_ROWS,
): AsyncGenerator<{ rows: R[]; bytes: number }, void, undefined> {
    const byteLimit = Math.max(1, maxBytes);
    const rowLimit = Math.max(1, maxRows);
    let current: R[] = [];
    let currentBytes = 0;

    for await (const { row, bytes } of rows) {
        if (
            current.length > 0 &&
            (currentBytes + bytes > byteLimit || current.length >= rowLimit)
        ) {
            yield { rows: current, bytes: currentBytes };
            current = [];
            currentBytes = 0;
        }
        current.push(row);
        currentBytes += bytes;
    }
    if (current.length > 0) {
        yield { rows: current, bytes: currentBytes };
    }
}
