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

/**
 * Cap a command's streams inside the sandbox so neither a buffering gateway
 * nor the backend ever receives more than the ceiling. Each stream keeps one
 * byte over the cap so the post-check can still tell truncation from an exact
 * fit. Exit code is preserved.
 */
export const capOutputInSandbox = (
    command: string,
    maxOutputBytes: number,
): string => {
    const keep = maxOutputBytes + 1;
    return (
        `__ld_d=$(mktemp -d); ( ${command} ) > "$__ld_d/o" 2> "$__ld_d/e"; __ld_rc=$?; ` +
        `head -c ${keep} "$__ld_d/o"; head -c ${keep} "$__ld_d/e" >&2; rm -rf "$__ld_d"; exit $__ld_rc`
    );
};

/** Worst case JSON escaping is 6 bytes per raw byte, plus envelope. */
export const maxBodyBytesFor = (maxOutputBytes: number): number =>
    2 * (maxOutputBytes + 1) * 6 + 64 * 1024;

export const assertWithinOutputLimit = (
    stdout: string,
    stderr: string,
    maxOutputBytes: number | undefined,
): void => {
    if (maxOutputBytes === undefined) return;
    if (
        Buffer.byteLength(stdout) + Buffer.byteLength(stderr) >
        maxOutputBytes
    ) {
        throw new SandboxOutputLimitError(maxOutputBytes);
    }
};
