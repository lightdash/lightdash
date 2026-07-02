import { getErrorMessage } from '@lightdash/common';
import { RequestHandler } from 'express';
import { pipeline } from 'stream';
import Logger from '../../logging/logger';
import { StaticAssetsS3Client } from './StaticAssetsS3Client';

export const isSafeAssetPath = (relativePath: string): boolean =>
    relativePath
        .split('/')
        .every(
            (segment) =>
                /^[\w.-]+$/.test(segment) &&
                segment !== '.' &&
                segment !== '..',
        );

/**
 * Serves hashed assets that a deploy removed from the pod image but the
 * bucket still retains. Falls through to the next handler (the hard 404)
 * on any miss, so behavior is unchanged when the bucket is not configured.
 */
export const createStaticAssetsFallbackHandler =
    (staticAssetsClient: StaticAssetsS3Client): RequestHandler =>
    async (req, res, next) => {
        if (!staticAssetsClient.isEnabled) {
            next();
            return;
        }

        const relativePath = req.params[0];
        if (!relativePath || !isSafeAssetPath(relativePath)) {
            next();
            return;
        }

        const asset = await staticAssetsClient.getAsset(relativePath);
        if (!asset) {
            next();
            return;
        }

        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Content-Type', asset.contentType);
        if (asset.contentLength !== undefined) {
            res.setHeader('Content-Length', asset.contentLength);
        }
        // pipeline (unlike pipe) destroys both streams if the bucket read
        // fails mid-transfer instead of emitting an unhandled 'error'
        pipeline(asset.body, res, (error) => {
            if (error) {
                Logger.warn(
                    `Streaming static asset '${relativePath}' failed: ${getErrorMessage(
                        error,
                    )}`,
                );
                if (!res.headersSent) {
                    res.status(500).end();
                }
            }
        });
    };
