import { BrowserContext } from '@playwright/test';

// Hashed, immutable bundle chunks. Every test starts a cold browser context, so without this
// each test re-downloads ~150 chunks from the preview; the cache is per worker process.
const ASSET_URL = /\/assets\/[^?]+\.(js|css)(\?.*)?$/;

type CachedAsset = {
    status: number;
    headers: Record<string, string>;
    body: Buffer;
};

const cache = new Map<string, CachedAsset>();

export const cacheImmutableAssets = async (context: BrowserContext) => {
    if (process.env.E2E_ASSET_CACHE === 'off') return;
    await context.route(ASSET_URL, async (route) => {
        const url = route.request().url();
        try {
            const hit = cache.get(url);
            if (hit) {
                await route.fulfill(hit);
                return;
            }
            const response = await route.fetch();
            const body = await response.body();
            // Replay only the content type: the body is already decoded, and the original
            // set-cookie would re-install a stale session on every later test.
            const headers = {
                'content-type': response.headers()['content-type'] ?? '',
                'cache-control': 'public, max-age=31536000, immutable',
            };
            const asset = { status: response.status(), headers, body };
            if (asset.status === 200) cache.set(url, asset);
            await route.fulfill(asset);
        } catch {
            // The page closed mid-flight; nothing is waiting for this response any more
        }
    });
};
