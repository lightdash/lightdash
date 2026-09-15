import { getErrorMessage } from '@lightdash/common';
import { RequestHandler } from 'express';
import { pipeline } from 'stream';
import Logger from '../../logging/logger';
import { getAssetContentType } from './assetContentType';
import { StaticAssetsS3Client } from './StaticAssetsS3Client';

const MAX_ASSET_PATH_LENGTH = 512;
const MISS_CACHE_TTL_MS = 60_000;
const MISS_CACHE_MAX_ENTRIES = 10_000;
const MAX_CONCURRENT_FETCHES = 128;

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
    // Repeated misses are cached briefly to reduce redundant bucket reads.
    const missedAt = new Map<string, number>();
    let activeFetches = 0;

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
            const oldestPath = missedAt.keys().next().value;
            if (oldestPath !== undefined) {
                missedAt.delete(oldestPath);
            }
        }
        missedAt.set(relativePath, Date.now());
    };

    return async (req, res, next) => {
        let fetchStarted = false;
        const releaseFetch = () => {
            if (fetchStarted) {
                fetchStarted = false;
                activeFetches -= 1;
            }
        };
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

            // Bound open upstream streams without imposing a shared request budget
            // that a probe could exhaust for all legitimate stale tabs.
            if (activeFetches >= MAX_CONCURRENT_FETCHES) {
                res.setHeader('Cache-Control', 'no-store');
                res.setHeader('Retry-After', '60');
                res.status(503).end();
                return;
            }
            activeFetches += 1;
            fetchStarted = true;
            const asset = await staticAssetsClient.getAsset(relativePath);
            if (res.destroyed) {
                asset?.body.destroy();
                releaseFetch();
                return;
            }
            if (!asset) {
                releaseFetch();
                recordMiss(relativePath);
                next();
                return;
            }

            // After headers, pipeline owns the body and cancels it on disconnect.
            res.once('close', releaseFetch);

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
                releaseFetch();
                res.end();
                return;
            }

            // pipeline (unlike pipe) destroys both streams if the bucket
            // read fails mid-transfer. The torn-down socket is the correct
            // client signal — a late status write would be swallowed on the
            // destroyed response, and could be CDN-cached as immutable if
            // it ever were delivered
            pipeline(asset.body, res, (error) => {
                releaseFetch();
                if (error) {
                    Logger.warn(
                        `Streaming static asset '${relativePath}' failed: ${getErrorMessage(
                            error,
                        )}`,
                    );
                }
            });
        } catch (error) {
            releaseFetch();
            Logger.warn(
                `Static asset fallback unavailable: ${getErrorMessage(error)}`,
            );
            // Do not negative-cache network/auth failures: the next request can recover.
            next();
        }
    };
};
