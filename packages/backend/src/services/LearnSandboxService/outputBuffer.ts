export const OUTPUT_HEAD_BYTES = 192 * 1024;
export const OUTPUT_TAIL_BYTES = 64 * 1024;
export const OUTPUT_TRUNCATED_MARKER = '... output truncated ...\n';
type Chunk = { seq: number; stream: 'stdout' | 'stderr'; text: string };
type Stream = Chunk['stream'];

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

    /**
     * Raw (unscrubbed) trailing bytes held back per stream because they
     * looked like the start of a secret. Combined with the next push before
     * scrubbing so a secret split across two reads is still caught.
     */
    private carry: Record<Stream, string> = { stdout: '', stderr: '' };

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

    /**
     * The length of the longest suffix of `raw` that is a proper prefix of
     * one of the current secrets, i.e. a suffix that could be the start of a
     * secret continued in the next chunk. Returns 0 when nothing looks like
     * a split secret, so a normal, complete chunk is emitted unchanged.
     */
    private splitSecretHoldback(raw: string): number {
        const secrets = this.secrets.filter(Boolean);
        const maxLen = Math.max(0, ...secrets.map((s) => s.length)) - 1;
        const upper = Math.min(maxLen, raw.length);
        for (let len = upper; len > 0; len -= 1) {
            const suffix = raw.slice(raw.length - len);
            if (secrets.some((secret) => secret.startsWith(suffix))) {
                return len;
            }
        }
        return 0;
    }

    private appendScrubbed(stream: Stream, text: string): void {
        if (text.length === 0) {
            return;
        }
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

    push(stream: Stream, raw: string): void {
        const combined = this.carry[stream] + raw;
        const holdback = this.splitSecretHoldback(combined);
        const emitRaw =
            holdback > 0
                ? combined.slice(0, combined.length - holdback)
                : combined;
        this.carry[stream] =
            holdback > 0 ? combined.slice(combined.length - holdback) : '';
        if (emitRaw.length === 0) {
            return;
        }
        this.appendScrubbed(stream, this.scrub(emitRaw));
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
        (['stdout', 'stderr'] as const).forEach((stream) => {
            if (this.carry[stream]) {
                const text = this.scrub(this.carry[stream]);
                this.carry[stream] = '';
                this.appendScrubbed(stream, text);
            }
        });
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
