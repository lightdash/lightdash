import {
    GetObjectCommand,
    NoSuchKey,
    NotFound,
    PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getErrorMessage } from '@lightdash/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { S3BaseClient } from '../Aws/S3BaseClient';

const KEY_PREFIX = 'assets/';

const CONTENT_TYPES: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.map': 'application/json',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
};

export type StaticAsset = {
    body: Readable;
    contentType: string;
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

/**
 * Retains hashed frontend assets across deploys. Every pod uploads its
 * bundled assets on startup; a bucket lifecycle rule ages out chunks once
 * they are no longer part of any running build, so stale browser tabs can
 * still load chunks the latest image no longer ships.
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

        try {
            const response = await this.s3.send(
                new GetObjectCommand({
                    Bucket: this.configuration.bucket,
                    Key: `${KEY_PREFIX}${relativePath}`,
                }),
            );
            if (!response.Body) {
                return null;
            }
            return {
                body: response.Body as Readable,
                contentType: response.ContentType ?? 'application/octet-stream',
                contentLength: response.ContentLength,
            };
        } catch (error) {
            if (error instanceof NoSuchKey || error instanceof NotFound) {
                return null;
            }
            Logger.error(
                `Failed to fetch static asset '${relativePath}' from bucket: ${getErrorMessage(
                    error,
                )}`,
            );
            return null;
        }
    }

    /**
     * Uploads are unconditional: rewriting an unchanged object resets its
     * lifecycle age in GCS/S3, which is what keeps the current build's
     * chunks from expiring while superseded ones age out.
     */
    async syncLocalAssets(localAssetsDir: string): Promise<void> {
        if (!this.s3 || !this.configuration) {
            return;
        }
        const { s3, configuration } = this;

        try {
            const relativePaths = await listFilesRecursively(localAssetsDir);
            const uploadable = relativePaths.filter(
                // .gzip files are precompressed companions served only by
                // expressStaticGzip from local disk
                (relativePath) => !relativePath.endsWith('.gzip'),
            );

            const upload = async (relativePath: string) => {
                const extension = path.extname(relativePath).toLowerCase();
                await s3.send(
                    new PutObjectCommand({
                        Bucket: configuration.bucket,
                        Key: `${KEY_PREFIX}${relativePath}`,
                        Body: await fs.readFile(
                            path.join(localAssetsDir, relativePath),
                        ),
                        ContentType:
                            CONTENT_TYPES[extension] ??
                            'application/octet-stream',
                        CacheControl: 'public, max-age=31536000, immutable',
                    }),
                );
            };

            await Promise.all(uploadable.map(upload));
            Logger.info(
                `Uploaded ${uploadable.length} static assets to bucket ${configuration.bucket}`,
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
