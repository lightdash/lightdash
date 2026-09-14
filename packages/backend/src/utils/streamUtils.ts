import split2 from 'split2';
import { pipeline, Readable, Writable } from 'stream';

/**
 * Write data to a stream with backpressure handling.
 * Waits for the drain event if the write buffer is full.
 */
export async function writeWithBackpressure(
    stream: Writable,
    data: string,
): Promise<void> {
    const canContinue = stream.write(data);
    if (!canContinue) {
        await new Promise<void>((resolve) => {
            stream.once('drain', resolve);
        });
    }
}

/**
 * Cap on a single JSONL line. Well beyond any legitimate row; a stream that
 * exceeds it (e.g. a non-JSONL file) errors instead of buffering unboundedly.
 */
const MAX_JSONL_LINE_LENGTH = 64 * 1024 * 1024; // 64MB

/**
 * Iterate over the lines of a newline-delimited JSON (JSONL) stream,
 * splitting strictly on `\n` (a trailing `\r` is stripped for CRLF input).
 *
 * Do NOT use `readline` to read JSONL: since Node 24 it also treats
 * U+2028/U+2029 as line terminators. `JSON.stringify` leaves those characters
 * unescaped inside string values, so `readline` splits such rows mid-string
 * and they fail to parse.
 */
export function splitJsonlStream(stream: Readable): AsyncIterable<string> {
    return pipeline(
        stream,
        // skipOverflow defaults to false: exceeding maxLength emits an error
        split2({ maxLength: MAX_JSONL_LINE_LENGTH }),
        // pipeline requires a callback; iteration surfaces errors so noop here
        () => {},
    );
}
