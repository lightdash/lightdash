import {
    GetObjectCommand,
    NoSuchKey,
    NotFound,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { getErrorMessage } from '@lightdash/common';
import { Readable } from 'stream';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { S3BaseClient } from '../Aws/S3BaseClient';

const KEY_PREFIX = 'assets/';
const GET_ASSET_TIMEOUT_MS = 5_000;

export type StaticAsset = {
    body: Readable;
    contentLength: number | undefined;
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
 * Read-only client for the bucket retaining hashed frontend assets across
 * deploys, so stale browser tabs can still load chunks the latest image no
 * longer ships. The backend never writes: the bucket is populated at
 * release time (see push-static-assets in
 * .github/workflows/post-release.yml, or your own deploy pipeline when
 * self-hosting), and a lifecycle rule ages out chunks no release
 * re-uploads anymore.
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
}
