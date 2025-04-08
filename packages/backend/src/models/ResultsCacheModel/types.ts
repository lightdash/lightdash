export type CacheHitCacheResult = {
    cacheKey: string;
    write: undefined;
    close: undefined;
    cacheHit: true;
    totalRowCount: number;
};

export type MissCacheResult = {
    cacheKey: string;
    write: (rows: Record<string, unknown>[]) => void;
    close: () => Promise<void>;
    cacheHit: false;
    totalRowCount: null;
};

export type CreateCacheResult = CacheHitCacheResult | MissCacheResult;
