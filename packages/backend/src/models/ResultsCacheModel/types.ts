export type CacheHitCacheResult = {
    cacheKey: string;
    write: undefined;
    close: undefined;
    cacheHit: true;
    totalRowCount: number;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
};

export type MissCacheResult = {
    cacheKey: string;
    write: (rows: Record<string, unknown>[]) => void;
    close: () => Promise<void>;
    cacheHit: false;
    totalRowCount: null;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
};

export type CreateCacheResult = CacheHitCacheResult | MissCacheResult;
