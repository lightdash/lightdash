import type { Readable } from 'stream';

/**
 * Destroys an S3 GetObject body and the HTTP response behind it.
 *
 * When a response carries an `x-amz-checksum-*` header the AWS SDK hands back
 * a `ChecksumStream` wrapper fed by `source.pipe(this)`. Destroying the
 * wrapper only unpipes: the HTTP response stays open and paused, the
 * keep-alive agent keeps counting its socket as busy, and after enough
 * early-terminated reads every S3 call on the process queues forever. Use
 * this instead of `body.destroy()` wherever a body is abandoned before `end`.
 */
export function destroyS3Body(body: Readable, error?: Error): void {
    const { source } = body as Readable & { source?: Readable };
    body.destroy(error);
    if (source && typeof source.destroy === 'function' && !source.destroyed) {
        source.destroy(error);
    }
}
