import { getErrorMessage } from '@lightdash/common';
import { RequestHandler } from 'express';
import { pipeline } from 'stream';
import Logger from '../../logging/logger';
import { getAssetContentType } from './assetContentType';
import { StaticAssetsS3Client } from './StaticAssetsS3Client';

const MAX_ASSET_PATH_LENGTH = 512;
const MISS_CACHE_TTL_MS = 60_000;
const MISS_CACHE_MAX_ENTRIES = 10_000;

type StaticAssetsReader = Pick<StaticAssetsS3Client, 'isEnabled' | 'getAsset'>;

export const isSafeAssetPath = (relativePath: string): boolean =>
    relativePath.length <= MAX_ASSET_PATH_LENGTH &&
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
 * bucket still retains. Every gate falls through to the next handler (the
 * hard 404), so behavior is unchanged when the bucket is not configured.
 */
export const createStaticAssetsFallbackHandler = (
    staticAssetsClient: StaticAssetsReader,
): RequestHandler => {
    // Misses are remembered briefly so unauthenticated probing of /assets/*
    // can't turn every request into a billed bucket GET (the CDN in front
    // has negative caching disabled, so 404s are never cached at the edge)
    const missedAt = new Map<string, number>();

    const isRecentMiss = (relativePath: string): boolean => {
        const missTime = missedAt.get(relativePath);
        if (missTime === undefined) {
            return false;
        }
        if (Date.now() - missTime > MISS_CACHE_TTL_MS) {
            missedAt.delete(relativePath);
            return false;
        }
        return true;
    };

    const recordMiss = (relativePath: string) => {
        if (missedAt.size >= MISS_CACHE_MAX_ENTRIES) {
            missedAt.clear();
        }
        missedAt.set(relativePath, Date.now());
    };

    return async (req, res, next) => {
        try {
            if (!staticAssetsClient.isEnabled) {
                next();
                return;
            }

            const relativePath = req.params[0];
            if (!relativePath || !isSafeAssetPath(relativePath)) {
                next();
                return;
            }

            // Vite only emits extensions the mime db knows; anything else
            // is a probe not worth a bucket round-trip
            const contentType = getAssetContentType(relativePath);
            if (!contentType) {
                next();
                return;
            }

            if (isRecentMiss(relativePath)) {
                next();
                return;
            }

            const asset = await staticAssetsClient.getAsset(relativePath);
            if (!asset) {
                recordMiss(relativePath);
                next();
                return;
            }

            res.setHeader(
                'Cache-Control',
                'public, max-age=31536000, immutable',
            );
            res.setHeader('Content-Type', contentType);
            if (asset.contentLength !== undefined) {
                res.setHeader('Content-Length', asset.contentLength);
            }

            // Express routes HEAD to GET handlers; skip the body transfer
            if (req.method === 'HEAD') {
                asset.body.destroy();
                res.end();
                return;
            }

            // pipeline (unlike pipe) destroys both streams if the bucket
            // read fails mid-transfer. The torn-down socket is the correct
            // client signal — a late status write would be swallowed on the
            // destroyed response, and could be CDN-cached as immutable if
            // it ever were delivered
            pipeline(asset.body, res, (error) => {
                if (error) {
                    Logger.warn(
                        `Streaming static asset '${relativePath}' failed: ${getErrorMessage(
                            error,
                        )}`,
                    );
                }
            });
        } catch (error) {
            next(error);
        }
    };
};
