import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { type Readable } from 'stream';

export const MAX_ANALYTICS_CACHE_FILE_BYTES = 4 * 1024 * 1024;

/** Small compressed files only; pending downloads count against both limits. */
export class AnalyticsFileCache {
    private readonly entries = new Map<
        string,
        { size: number; ready: boolean; value: Promise<Buffer | undefined> }
    >();

    private bytes = 0;

    private downloads = 0;

    private readonly queue: Array<() => void> = [];

    constructor(private readonly maxBytes = 64 * 1024 * 1024) {}

    async get(
        scope: string,
        client: S3Client,
        bucket: string,
        key: string,
        etag: string | undefined,
        size: number | undefined,
    ): Promise<Buffer | undefined> {
        if (
            !etag ||
            !size ||
            !Number.isSafeInteger(size) ||
            size < 0 ||
            size > MAX_ANALYTICS_CACHE_FILE_BYTES ||
            size > this.maxBytes
        )
            return undefined;
        // Scope includes endpoint, bucket and the authorized organization prefix.
        const identity = JSON.stringify([scope, key, etag, size]);
        const hit = this.entries.get(identity);
        if (hit) {
            this.entries.delete(identity);
            this.entries.set(identity, hit);
            return hit.value;
        }
        for (const [id, entry] of this.entries) {
            if (
                this.bytes + size <= this.maxBytes &&
                this.entries.size < 16_384
            )
                break;
            if (entry.ready) {
                this.entries.delete(id);
                this.bytes -= entry.size;
            }
        }
        if (this.bytes + size > this.maxBytes || this.entries.size >= 16_384)
            return undefined;
        this.bytes += size;
        const entry = {
            size,
            ready: false,
            value: Promise.resolve<Buffer | undefined>(undefined),
        };
        this.entries.set(identity, entry);
        entry.value = (async () => {
            // Queued downloads reserve bytes and entries before waiting.
            if (this.downloads >= 16) {
                await new Promise<void>((resolve) => {
                    this.queue.push(resolve);
                });
            } else this.downloads += 1;
            try {
                const response = await client.send(
                    new GetObjectCommand({
                        Bucket: bucket,
                        Key: key,
                        IfMatch: etag,
                    }),
                    { abortSignal: AbortSignal.timeout(10_000) },
                );
                const body = response.Body as Readable | undefined;
                if (!body) throw new Error('Missing body');
                try {
                    if (
                        response.ETag !== etag ||
                        response.ContentLength !== size
                    )
                        throw new Error('Changed file');
                    const data = Buffer.alloc(size);
                    let offset = 0;
                    for await (const chunk of body) {
                        const bytes = Buffer.from(chunk);
                        if (offset + bytes.length > size)
                            throw new Error('Oversized file');
                        data.set(bytes, offset);
                        offset += bytes.length;
                    }
                    if (offset !== size) throw new Error('Incomplete file');
                    entry.ready = true;
                    return data;
                } finally {
                    body.destroy();
                }
            } catch {
                // Cache failure must preserve the existing signed-URL read path.
                this.entries.delete(identity);
                this.bytes -= size;
                return undefined;
            } finally {
                const next = this.queue.shift();
                if (next) next();
                else this.downloads -= 1;
            }
        })();
        return entry.value;
    }
}

export const analyticsFileCache = new AnalyticsFileCache();
