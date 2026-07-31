import { Readable, Writable } from 'stream';
import { StringDecoder } from 'string_decoder';

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
 * Iterate over the lines of a newline-delimited JSON (JSONL) stream,
 * splitting strictly on `\n` (a trailing `\r` is stripped for CRLF input).
 *
 * Do NOT use `readline` to read JSONL: since Node 24 it also treats
 * U+2028/U+2029 as line terminators. `JSON.stringify` leaves those characters
 * unescaped inside string values, so `readline` splits such rows mid-string
 * and they fail to parse.
 */
export async function* splitJsonlStream(
    stream: Readable,
): AsyncGenerator<string> {
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    for await (const chunk of stream) {
        buffer +=
            typeof chunk === 'string' ? chunk : decoder.write(chunk as Buffer);
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);
            yield line.endsWith('\r') ? line.slice(0, -1) : line;
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf('\n');
        }
    }
    buffer += decoder.end();
    if (buffer.length > 0) {
        yield buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
    }
}
