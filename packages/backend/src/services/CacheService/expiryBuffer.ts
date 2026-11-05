// Keeps cached results valid while a client pages through them.
export const DEFAULT_CACHE_EXPIRY_BUFFER_MS = 10 * 60 * 1000;

export const getResultsCacheExpiryBufferMs = (ttlMs: number): number =>
    ttlMs > DEFAULT_CACHE_EXPIRY_BUFFER_MS * 4
        ? DEFAULT_CACHE_EXPIRY_BUFFER_MS
        : ttlMs / 4;
