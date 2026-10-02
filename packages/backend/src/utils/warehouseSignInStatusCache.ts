const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 500;

const entries = new Map<string, { expired: boolean; expiresAt: number }>();

export const getCachedWarehouseSignInStatus = (
    uuid: string,
): boolean | null => {
    const entry = entries.get(uuid);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        entries.delete(uuid);
        return null;
    }
    return entry.expired;
};

export const cacheWarehouseSignInStatus = (
    uuid: string,
    expired: boolean,
): void => {
    entries.delete(uuid);
    if (entries.size >= MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest) entries.delete(oldest);
    }
    entries.set(uuid, { expired, expiresAt: Date.now() + TTL_MS });
};

export const clearCachedWarehouseSignInStatus = (uuid: string): void => {
    entries.delete(uuid);
};
