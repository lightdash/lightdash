export const OUTPUT_HEAD_BYTES = 192 * 1024;
export const OUTPUT_TAIL_BYTES = 64 * 1024;
export const OUTPUT_TRUNCATED_MARKER = '... output truncated ...\n';
type Chunk = { seq: number; stream: 'stdout' | 'stderr'; text: string };

export class OutputBuffer {
    private secrets: string[];

    private pending: Chunk[] = [];

    private pendingBytes = 0;

    private seq = 0;

    private headBytes = 0;

    private tail: Chunk[] = [];

    private tailBytes = 0;

    private truncated = false;

    private timer: NodeJS.Timeout | null = null;

    private flushing: Promise<void> = Promise.resolve();

    private lastError: unknown;

    get error(): unknown {
        return this.lastError;
    }

    constructor(
        private readonly opts: {
            secrets: string[];
            flushEveryMs?: number;
            flushBytes?: number;
            onFlush: (chunks: Chunk[]) => Promise<void>;
        },
    ) {
        this.secrets = opts.secrets;
    }

    setSecrets(secrets: string[]): void {
        this.secrets = secrets;
    }

    private scrub(text: string): string {
        return this.secrets
            .filter(Boolean)
            .reduce((acc, s) => acc.split(s).join('***'), text);
    }

    push(stream: Chunk['stream'], raw: string): void {
        const text = this.scrub(raw);
        if (
            this.truncated ||
            this.headBytes + text.length > OUTPUT_HEAD_BYTES
        ) {
            this.truncated = true;
            this.tail.push({ seq: 0, stream, text });
            this.tailBytes += text.length;
            while (this.tailBytes > OUTPUT_TAIL_BYTES && this.tail.length > 1) {
                const dropped = this.tail.shift() as Chunk;
                this.tailBytes -= dropped.text.length;
            }
            if (this.tail.length === 1 && this.tailBytes > OUTPUT_TAIL_BYTES) {
                this.tail[0].text = this.tail[0].text.slice(-OUTPUT_TAIL_BYTES);
                this.tailBytes = this.tail[0].text.length;
            }
            return;
        }
        this.headBytes += text.length;
        this.seq += 1;
        this.pending.push({ seq: this.seq, stream, text });
        this.pendingBytes += text.length;
        if (this.pendingBytes >= (this.opts.flushBytes ?? 4096)) {
            void this.flush();
        } else if (!this.timer) {
            this.timer = setTimeout(
                () => void this.flush(),
                this.opts.flushEveryMs ?? 250,
            );
        }
    }

    flush(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        const batch = this.pending;
        this.pending = [];
        this.pendingBytes = 0;
        if (batch.length === 0) return this.flushing;
        this.flushing = this.flushing
            .then(() => this.opts.onFlush(batch))
            .catch((error: unknown) => {
                this.lastError = error;
            });
        return this.flushing;
    }

    async close(): Promise<void> {
        if (this.truncated) {
            this.seq += 1;
            this.pending.push({
                seq: this.seq,
                stream: 'stdout',
                text: OUTPUT_TRUNCATED_MARKER,
            });
            this.tail.forEach((c) => {
                this.seq += 1;
                this.pending.push({ ...c, seq: this.seq });
            });
            this.tail = [];
        }
        await this.flush();
    }
}
