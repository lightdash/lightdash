import { Writable } from 'stream';

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
