import { SandboxOutputLimitError } from './errors';

/** Check each transport chunk before retaining it, including growing files. */
export const readBoundedStream = async (
    stream: ReadableStream<Uint8Array>,
    maxBytes: number,
): Promise<Buffer> => {
    const reader = stream.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
        for (;;) {
            // Sequential reads let us stop before the next chunk is retained.
            // eslint-disable-next-line no-await-in-loop
            const { value, done } = await reader.read();
            if (done) return Buffer.concat(chunks, bytes);
            bytes += value.byteLength;
            if (bytes > maxBytes) throw new SandboxOutputLimitError(maxBytes);
            chunks.push(Buffer.from(value));
        }
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }
};
