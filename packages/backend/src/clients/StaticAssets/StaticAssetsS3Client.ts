import {
    GetObjectCommand,
    NoSuchKey,
    NotFound,
    PutObjectCommand,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { getErrorMessage } from '@lightdash/common';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { S3BaseClient } from '../Aws/S3BaseClient';
import { getAssetContentType } from './assetContentType';

const KEY_PREFIX = 'assets/';
const GET_ASSET_TIMEOUT_MS = 5_000;
const UPLOAD_BATCH_SIZE = 10;

export type StaticAsset = {
    body: Readable;
    contentLength: number | undefined;
};

const listFilesRecursively = async (dir: string): Promise<string[]> => {
    const entries = await fs.readdir(dir, {
        recursive: true,
        withFileTypes: true,
    });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) =>
            path
                .relative(dir, path.join(entry.parentPath, entry.name))
                .split(path.sep)
                .join('/'),
        );
};

// A missing object is 404 (NoSuchKey/NotFound) on GCS/MinIO but can be a
// bare 403 on AWS S3 without s3:ListBucket — all are a miss, not an error
const isMissingObjectError = (error: unknown): boolean => {
    if (error instanceof NoSuchKey || error instanceof NotFound) {
        return true;
    }
    return (
        error instanceof S3ServiceException &&
        (error.$metadata.httpStatusCode === 403 ||
            error.$metadata.httpStatusCode === 404)
    );
};

/**
 * Retains hashed frontend assets across deploys so stale browser tabs can
 * still load chunks the latest image no longer ships. The bucket is filled
 * either by each pod on startup (syncLocalAssets, the default) or by the
 * release pipeline at image-publish time (see push-static-assets in
 * .github/workflows/post-release.yml) with pod sync disabled via
 * ASSETS_S3_SYNC_ENABLED=false. A bucket lifecycle rule ages out chunks
 * that no release re-uploads anymore.
 */
export class StaticAssetsS3Client extends S3BaseClient {
    private readonly configuration: LightdashConfig['staticAssets']['s3'];

    constructor({ lightdashConfig }: { lightdashConfig: LightdashConfig }) {
        super(lightdashConfig.staticAssets.s3);
        this.configuration = lightdashConfig.staticAssets.s3;

        if (this.s3 && this.configuration) {
            Logger.info(
                `Static assets bucket fallback enabled: ${this.configuration.bucket}`,
            );
        }
    }

    get isEnabled(): boolean {
        return this.s3 !== undefined && this.configuration !== undefined;
    }

    async getAsset(relativePath: string): Promise<StaticAsset | null> {
        if (!this.s3 || !this.configuration) {
            return null;
        }

        // Bound time-to-response so a slow bucket degrades to the fast 404
        // instead of hanging /assets requests through SDK retries. Cleared
        // once headers arrive — body streaming is backpressure-driven and
        // must not be cut off for slow clients.
        const abortController = new AbortController();
        const timeoutHandle = setTimeout(
            () => abortController.abort(),
            GET_ASSET_TIMEOUT_MS,
        );
        try {
            const response = await this.s3.send(
                new GetObjectCommand({
                    Bucket: this.configuration.bucket,
                    Key: `${KEY_PREFIX}${relativePath}`,
                }),
                { abortSignal: abortController.signal },
            );
            if (!response.Body) {
                return null;
            }
            return {
                body: response.Body as Readable,
                contentLength: response.ContentLength,
            };
        } catch (error) {
            if (!isMissingObjectError(error)) {
                Logger.warn(
                    `Failed to fetch static asset '${relativePath}' from bucket: ${getErrorMessage(
                        error,
                    )}`,
                );
            }
            return null;
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    /**
     * Uploads are unconditional: rewriting an unchanged object resets its
     * lifecycle age in GCS/S3, which is what keeps the current build's
     * chunks from expiring while superseded ones age out. Never throws —
     * callers fire-and-forget at startup.
     */
    async syncLocalAssets(localAssetsDir: string): Promise<void> {
        if (!this.s3 || !this.configuration) {
            return;
        }
        const { s3, configuration } = this;

        try {
            const relativePaths = await listFilesRecursively(localAssetsDir);
            const uploadable = relativePaths.filter(
                // .gzip files are precompressed companions served only from
                // local disk; .map sourcemaps are the bulk of the build and
                // only fetched with devtools open — a 404 there is harmless
                (relativePath) =>
                    !relativePath.endsWith('.gzip') &&
                    !relativePath.endsWith('.map'),
            );

            const upload = async (relativePath: string) => {
                const absolutePath = path.join(localAssetsDir, relativePath);
                const { size } = await fs.stat(absolutePath);
                await s3.send(
                    new PutObjectCommand({
                        Bucket: configuration.bucket,
                        Key: `${KEY_PREFIX}${relativePath}`,
                        Body: createReadStream(absolutePath),
                        ContentLength: size,
                        ContentType:
                            getAssetContentType(relativePath) ??
                            'application/octet-stream',
                        CacheControl: 'public, max-age=31536000, immutable',
                    }),
                );
            };

            // Bounded batches: firing every PUT at once would hold the whole
            // build in flight on a pod that is already serving traffic
            const results: PromiseSettledResult<void>[] = [];
            for (let i = 0; i < uploadable.length; i += UPLOAD_BATCH_SIZE) {
                // eslint-disable-next-line no-await-in-loop
                const batchResults = await Promise.allSettled(
                    uploadable.slice(i, i + UPLOAD_BATCH_SIZE).map(upload),
                );
                results.push(...batchResults);
            }

            const failed = results.filter(
                (result): result is PromiseRejectedResult =>
                    result.status === 'rejected',
            );
            if (failed.length > 0) {
                Logger.error(
                    `Failed to upload ${failed.length}/${
                        uploadable.length
                    } static assets to bucket ${
                        configuration.bucket
                    }: ${getErrorMessage(failed[0].reason)}`,
                );
            }
            Logger.info(
                `Uploaded ${uploadable.length - failed.length}/${
                    uploadable.length
                } static assets to bucket ${configuration.bucket}`,
            );
        } catch (error) {
            Logger.error(
                `Failed to sync static assets to bucket: ${getErrorMessage(
                    error,
                )}`,
            );
        }
    }
}
