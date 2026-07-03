/**
 * Shared cap on captured command output. Every data plane accumulates a command's
 * full stdout/stderr in memory to build a {@link CommandResult} (and to attach to
 * {@link SandboxCommandError} on failure). Untrusted code runs inside the sandbox,
 * so a single command (`yes | head -c 10G`) could otherwise exhaust the worker's
 * heap and dump gigabytes into the error logs. The channels funnel their captured
 * output through here so no single command can grow past
 * {@link MAX_CAPTURED_OUTPUT_BYTES}, and truncation is made visible in the
 * returned/logged text.
 */

/** Per-stream cap (stdout and stderr are capped independently). 10 MB. */
export const MAX_CAPTURED_OUTPUT_BYTES = 10 * 1024 * 1024;

const truncationMarker = (droppedBytes: number, maxBytes: number): string =>
    `\n[output truncated: ${droppedBytes} byte(s) dropped, capped at ${maxBytes} bytes]`;

/**
 * A byte-bounded accumulator for one output stream. Appended chunks (text or raw
 * bytes) are kept until {@link MAX_CAPTURED_OUTPUT_BYTES} is reached, after which
 * further bytes are counted but discarded. {@link toBuffer}/{@link toString}
 * append a truncation marker when anything was dropped. Used by the streaming
 * (Lambda) and buffered (Docker) data planes; the buffered SDK planes (E2B/Azure)
 * cap their already-materialized strings with {@link capOutput}.
 */
export class CappedOutput {
    private readonly chunks: Buffer[] = [];

    private keptBytes = 0;

    private droppedBytes = 0;

    constructor(private readonly maxBytes: number = MAX_CAPTURED_OUTPUT_BYTES) {}

    append(chunk: string | Buffer): void {
        const buffer =
            typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
        const remaining = this.maxBytes - this.keptBytes;
        if (remaining <= 0) {
            this.droppedBytes += buffer.length;
            return;
        }
        if (buffer.length <= remaining) {
            this.chunks.push(buffer);
            this.keptBytes += buffer.length;
            return;
        }
        this.chunks.push(buffer.subarray(0, remaining));
        this.keptBytes += remaining;
        this.droppedBytes += buffer.length - remaining;
    }

    get isTruncated(): boolean {
        return this.droppedBytes > 0;
    }

    toBuffer(): Buffer {
        const body = Buffer.concat(this.chunks);
        if (this.droppedBytes === 0) {
            return body;
        }
        return Buffer.concat([
            body,
            Buffer.from(
                truncationMarker(this.droppedBytes, this.maxBytes),
                'utf8',
            ),
        ]);
    }

    toString(): string {
        return this.toBuffer().toString('utf8');
    }
}

/**
 * Cap an already-buffered output string (from an SDK/REST call that returned the
 * whole payload at once). Truncates to {@link maxBytes} and appends the same
 * marker when anything was dropped.
 */
export const capOutput = (
    text: string,
    maxBytes: number = MAX_CAPTURED_OUTPUT_BYTES,
): string => {
    const buffer = Buffer.from(text, 'utf8');
    if (buffer.length <= maxBytes) {
        return text;
    }
    return (
        buffer.subarray(0, maxBytes).toString('utf8') +
        truncationMarker(buffer.length - maxBytes, maxBytes)
    );
};
