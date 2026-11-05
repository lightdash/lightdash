type SignedUrlEntry = {
    expiresAt: number;
    ready: boolean;
    bytes: number;
    value: Promise<string>;
};

type SignedUrlRequest = {
    identity: string;
    /** Reuse deadline, including the caller's expiry safety margin. */
    expiresAt: number;
    sign: () => Promise<string>;
};

export class AnalyticsSignedUrlCache {
    private readonly entries = new Map<string, SignedUrlEntry>();

    private readonly queue: Array<() => void> = [];

    private bytes = 0;

    private signing = 0;

    constructor(
        private readonly options: {
            maxEntries: number;
            maxBytes: number;
            concurrency: number;
            now: () => number;
        } = {
            maxEntries: 16384,
            maxBytes: 32 * 1024 * 1024,
            concurrency: 16,
            now: Date.now,
        },
    ) {}

    private remove(identity: string, entry: SignedUrlEntry) {
        if (this.entries.get(identity) !== entry) return;
        this.entries.delete(identity);
        this.bytes -= entry.bytes;
    }

    private async acquire() {
        if (this.signing < this.options.concurrency) {
            this.signing += 1;
            return;
        }
        await new Promise<void>((resolve) => {
            this.queue.push(resolve);
        });
    }

    private release() {
        const next = this.queue.shift();
        if (next) next();
        else this.signing -= 1;
    }

    clear() {
        if (this.signing > 0)
            throw new Error('Cannot clear analytics URLs while signing');
        this.entries.clear();
        this.bytes = 0;
    }

    async get({
        identity,
        expiresAt,
        sign,
    }: SignedUrlRequest): Promise<{ url: string; cacheHit: boolean }> {
        const hit = this.entries.get(identity);
        if (hit) {
            // Pending entries stay reserved until signing finishes.
            if (!hit.ready || hit.expiresAt > this.options.now()) {
                this.entries.delete(identity);
                this.entries.set(identity, hit);
                const url = await hit.value;
                if (hit.expiresAt > this.options.now())
                    return { url, cacheHit: true };
                this.remove(identity, hit);
                return this.get({ identity, expiresAt, sign });
            }
            this.remove(identity, hit);
        }

        for (const [id, entry] of this.entries) {
            if (this.entries.size < this.options.maxEntries) break;
            if (entry.ready) this.remove(id, entry);
        }
        // The entry limit also bounds queued signing requests.
        if (this.entries.size >= this.options.maxEntries)
            throw new Error('Analytics URL signing capacity exceeded');

        const entry: SignedUrlEntry = {
            expiresAt,
            ready: false,
            bytes: 0,
            value: Promise.resolve(''),
        };
        this.entries.set(identity, entry);
        entry.value = (async () => {
            await this.acquire();
            try {
                const url = await sign();
                entry.ready = true;
                entry.bytes = Buffer.byteLength(url);
                this.bytes += entry.bytes;
                if (
                    expiresAt <= this.options.now() ||
                    entry.bytes > this.options.maxBytes
                ) {
                    this.remove(identity, entry);
                } else {
                    for (const [id, cached] of this.entries) {
                        if (this.bytes <= this.options.maxBytes) break;
                        if (cached.ready) this.remove(id, cached);
                    }
                }
                return url;
            } catch (error) {
                this.remove(identity, entry);
                throw error;
            } finally {
                this.release();
            }
        })();
        return { url: await entry.value, cacheHit: false };
    }
}

export const analyticsSignedUrlCache = new AnalyticsSignedUrlCache();
