import * as fs from 'fs';

interface WithCacheOpts<T> {
    cachePath: string;
    label: string;
    force: boolean;
    computeHash?: () => string;
    ttlMs?: number;
    compute: () => T;
}

export function withCache<T>(opts: WithCacheOpts<T>): { data: T; fromCache: boolean } {
    const { cachePath, label, force, computeHash, ttlMs, compute } = opts;

    const hash = computeHash?.();
    const shortHash = hash?.slice(0, 12);

    if (!force && fs.existsSync(cachePath)) {
        try {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

            if (ttlMs !== undefined) {
                const age = Date.now() - new Date(cached._generatedAt).getTime();
                if (age < ttlMs) {
                    const hours = Math.round(age / (60 * 60 * 1000));
                    console.log(`${label} cache is ${hours}h old (TTL: ${Math.round(ttlMs / (60 * 60 * 1000))}h). Use --refresh to re-fetch.`);
                    return { data: cached, fromCache: true };
                }
                console.log(`${label} cache expired. Re-fetching...`);
            } else if (hash !== undefined) {
                if (cached._hash === hash) {
                    console.log(`${label} cache up to date (${shortHash}…). Use --refresh to regenerate.`);
                    return { data: cached, fromCache: true };
                }
                console.log(`Source changed since last ${label.toLowerCase()} (${shortHash}…). Regenerating...`);
            }
        } catch {
            console.log(`${label} cache corrupt. Regenerating...`);
        }
    } else if (force) {
        console.log(`Forced ${label.toLowerCase()} regeneration (${shortHash ?? ''}…)...`);
    } else {
        console.log(`No ${label.toLowerCase()} cache found (${shortHash ?? ''}…). Generating...`);
    }

    const data = compute();

    const cacheData: Record<string, unknown> = {
        ...(data as Record<string, unknown>),
        _generatedAt: new Date().toISOString(),
    };
    if (hash !== undefined) {
        cacheData._hash = hash;
    }
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2) + '\n');
    console.log(`Cached to ${cachePath}`);

    return { data: data as T, fromCache: false };
}
