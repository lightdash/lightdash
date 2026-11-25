import { getErrorMessage } from '@lightdash/common';
import type { ServerResponse } from 'http';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import Logger from '../../logging/logger';

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

/**
 * Streams a body to an HTTP response. Unlike `body.pipe(res)`, the body is
 * destroyed when the client disconnects, so its S3 socket is released. A
 * failed stream resets the connection, as nothing can follow a partial body.
 */
export async function pipeS3BodyToResponse(
    body: Readable,
    res: ServerResponse,
): Promise<void> {
    try {
        await pipeline(body, res);
    } catch (error) {
        destroyS3Body(body);
        const { code } = error as NodeJS.ErrnoException;
        if (
            code !== 'ERR_STREAM_PREMATURE_CLOSE' &&
            code !== 'ERR_STREAM_UNABLE_TO_PIPE'
        ) {
            Logger.warn(
                `Streaming S3 body to response failed: ${getErrorMessage(error)}`,
            );
        }
    }
}

export function untilAborted<T>(
    work: Promise<T>,
    abortSignal: AbortSignal | undefined,
): Promise<T> {
    if (!abortSignal) return work;
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortSignal.reason);
        if (abortSignal.aborted) {
            onAbort();
            return;
        }
        abortSignal.addEventListener('abort', onAbort, { once: true });
        work.then(resolve, reject).finally(() => {
            abortSignal.removeEventListener('abort', onAbort);
        });
    });
}

export async function readWholeBody(
    body: Readable,
    abortSignal: AbortSignal | undefined,
): Promise<Buffer> {
    const stop = () => {
        destroyS3Body(body);
    };
    if (abortSignal?.aborted) {
        stop();
        abortSignal.throwIfAborted();
    }
    abortSignal?.addEventListener('abort', stop, { once: true });
    try {
        const chunks: Buffer[] = [];
        for await (const chunk of body) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        abortSignal?.throwIfAborted();
        return Buffer.concat(chunks);
    } catch (error) {
        abortSignal?.throwIfAborted();
        throw error;
    } finally {
        abortSignal?.removeEventListener('abort', stop);
    }
}
