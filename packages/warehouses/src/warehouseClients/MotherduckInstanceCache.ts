import { DuckDBInstance } from '@duckdb/node-api';
import { createHash, randomUUID } from 'crypto';

export type DuckdbInstance = Awaited<ReturnType<typeof DuckDBInstance.create>>;

export type EvictionReason =
    | 'idle_ttl'
    | 'max_age'
    | 'lru'
    | 'stale'
    | 'auth'
    | 'failures'
    | 'credentials_updated'
    | 'shutdown';

export type MotherduckCacheEvent =
    | {
          type: 'acquire';
          result: 'hit' | 'miss';
          entryId: string;
          projectUuid?: string;
          waitMs: number;
          instanceCreateMs: number;
          connectMs: number;
      }
    | {
          type: 'evict';
          entryId: string;
          projectUuid?: string;
          reason: EvictionReason;
          ageMs: number;
      }
    | {
          type: 'retry';
          entryId: string;
          outcome: 'recovered' | 'failed';
      }
    | { type: 'size'; entries: number };

type CacheOptions = {
    idleTtlMs: number;
    maxAgeMs: number;
    maxEntries: number;
    maxConsecutiveFailures?: number;
};

export type MotherduckCacheAcquisitionTiming = {
    waitMs: number;
    instanceCreateMs: number;
    connectMs: number;
};

type ResolvedCacheOptions = CacheOptions & {
    maxConsecutiveFailures: number;
};

type CacheEntry = {
    instance: DuckdbInstance;
    entryId: string;
    projectUuid?: string;
    createdAt: number;
    lastUsedAt: number;
    refCount: number;
    consecutiveFailures: number;
    draining: boolean;
    closed: boolean;
    closePromise: Promise<void>;
    resolveClose: () => void;
};

type CacheAcquisition = {
    entry: CacheEntry;
    result: 'hit' | 'miss';
    waitMs: number;
    instanceCreateMs: number;
};

type CacheCreation = {
    entry: CacheEntry;
    instanceCreateMs: number;
};

type PendingCreation = {
    generation: number;
    invalidated: boolean;
    promise: Promise<CacheCreation | undefined>;
};

const holdEntry = (entry: CacheEntry) => {
    const heldEntry = entry;
    heldEntry.refCount += 1;
    heldEntry.lastUsedAt = performance.now();
    return heldEntry;
};

const DEFAULT_OPTIONS: ResolvedCacheOptions = {
    idleTtlMs: 10 * 60_000,
    maxAgeMs: 60 * 60_000,
    maxEntries: 8,
    maxConsecutiveFailures: 3,
};

let options: ResolvedCacheOptions = DEFAULT_OPTIONS;
let observer: (event: MotherduckCacheEvent) => void = () => undefined;
let sweepTimer: ReturnType<typeof setInterval> | undefined;
const entries = new Map<string, CacheEntry>();
const pendingCreations = new Map<string, PendingCreation>();
const creationGenerations = new Map<string, number>();

const emit = (event: MotherduckCacheEvent) => {
    try {
        observer(event);
    } catch {
        return;
    }
};

const cacheKeyFor = (connectionString: string) =>
    createHash('sha256')
        .update(JSON.stringify({ connectionString, v: 1 }))
        .digest('hex');

const closeInstance = (instance: DuckdbInstance) => {
    try {
        instance.closeSync?.();
        return true;
    } catch {
        return false;
    }
};

const closeEntry = (entry: CacheEntry) => {
    if (entry.closed || entry.refCount > 0) {
        return;
    }

    const closingEntry = entry;
    closingEntry.closed = true;
    closeInstance(closingEntry.instance);
    closingEntry.resolveClose();
};

const unlinkEntry = (
    key: string,
    entry: CacheEntry,
    reason: EvictionReason,
) => {
    if (entries.get(key) !== entry) {
        return entry.closePromise;
    }

    entries.delete(key);
    const drainingEntry = entry;
    drainingEntry.draining = true;
    emit({
        type: 'evict',
        entryId: entry.entryId,
        projectUuid: entry.projectUuid,
        reason,
        ageMs: performance.now() - entry.createdAt,
    });
    emit({ type: 'size', entries: entries.size });
    closeEntry(entry);
    return entry.closePromise;
};

const sweep = () => {
    const now = performance.now();

    entries.forEach((entry, key) => {
        const ageMs = now - entry.createdAt;
        const idleMs = now - entry.lastUsedAt;
        if (ageMs >= options.maxAgeMs) {
            void unlinkEntry(key, entry, 'max_age');
        } else if (entry.refCount === 0 && idleMs >= options.idleTtlMs) {
            void unlinkEntry(key, entry, 'idle_ttl');
        }
    });
};

const scheduleSweep = () => {
    if (sweepTimer) {
        clearInterval(sweepTimer);
    }

    const intervalMs = Math.max(
        1,
        Math.min(options.idleTtlMs, options.maxAgeMs, 60_000),
    );
    sweepTimer = setInterval(() => {
        sweep();
    }, intervalMs);
    sweepTimer.unref();
};

const createEntry = async (
    key: string,
    connectionString: string,
    generation: number,
    projectUuid?: string,
): Promise<CacheCreation | undefined> => {
    const createStart = performance.now();
    // Deliberately bypass fromCache(): mixing its unbounded singleton with this cache would create conflicting lifecycles.
    // Revisit on @duckdb/node-api upgrades if the binding cache gains eviction bounds.
    const instance = await DuckDBInstance.create(connectionString);
    const instanceCreateMs = performance.now() - createStart;
    if ((creationGenerations.get(key) ?? 0) !== generation) {
        closeInstance(instance);
        return undefined;
    }
    let resolveClose: () => void = () => undefined;
    const closePromise = new Promise<void>((resolve) => {
        resolveClose = resolve;
    });
    const now = performance.now();
    const entry: CacheEntry = {
        instance,
        entryId: randomUUID(),
        projectUuid,
        createdAt: now,
        lastUsedAt: now,
        refCount: 1,
        consecutiveFailures: 0,
        draining: false,
        closed: false,
        closePromise,
        resolveClose,
    };
    entries.set(key, entry);
    emit({ type: 'size', entries: entries.size });

    if (entries.size > options.maxEntries) {
        const lru = [...entries.entries()]
            .filter(([, candidate]) => candidate !== entry)
            .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)
            .at(0);
        if (lru) {
            void unlinkEntry(lru[0], lru[1], 'lru');
        }
    }

    return { entry, instanceCreateMs };
};

const resolveCreation = async (
    key: string,
    pending: PendingCreation,
    result: 'hit' | 'miss',
    getWaitMs: () => number,
    retry: () => Promise<CacheAcquisition>,
): Promise<CacheAcquisition> => {
    let created: CacheCreation | undefined;
    try {
        created = await pending.promise;
    } finally {
        if (pendingCreations.get(key) === pending) {
            pendingCreations.delete(key);
            if ((creationGenerations.get(key) ?? 0) === pending.generation) {
                creationGenerations.delete(key);
            }
        }
    }

    if (!created || pending.invalidated) {
        if (created && result === 'miss') {
            created.entry.refCount -= 1;
            closeEntry(created.entry);
        }
        return retry();
    }

    return {
        entry: result === 'hit' ? holdEntry(created.entry) : created.entry,
        result,
        waitMs: getWaitMs(),
        instanceCreateMs: result === 'miss' ? created.instanceCreateMs : 0,
    };
};

const acquire = async (
    connectionString: string,
    projectUuid?: string,
): Promise<CacheAcquisition> => {
    const waitStart = performance.now();
    sweep();
    const key = cacheKeyFor(connectionString);
    const existing = entries.get(key);
    if (existing) {
        return {
            entry: holdEntry(existing),
            result: 'hit',
            waitMs: performance.now() - waitStart,
            instanceCreateMs: 0,
        };
    }

    const pending = pendingCreations.get(key);
    if (pending) {
        return resolveCreation(
            key,
            pending,
            'hit',
            () => performance.now() - waitStart,
            () => acquire(connectionString, projectUuid),
        );
    }

    const generation = creationGenerations.get(key) ?? 0;
    const waitMs = performance.now() - waitStart;
    const creation: PendingCreation = {
        generation,
        invalidated: false,
        promise: createEntry(key, connectionString, generation, projectUuid),
    };
    pendingCreations.set(key, creation);
    return resolveCreation(
        key,
        creation,
        'miss',
        () => waitMs,
        () => acquire(connectionString, projectUuid),
    );
};

export const configure = (nextOptions: CacheOptions): void => {
    options = {
        ...nextOptions,
        maxConsecutiveFailures:
            nextOptions.maxConsecutiveFailures ??
            DEFAULT_OPTIONS.maxConsecutiveFailures,
    };
    scheduleSweep();
};

export const setObserver = (
    nextObserver: (event: MotherduckCacheEvent) => void,
): void => {
    observer = nextObserver;
    emit({ type: 'size', entries: entries.size });
};

export const withInstance = async <T>(
    connectionString: string,
    ctx: { projectUuid?: string },
    fn: (
        instance: DuckdbInstance,
        entryId: string,
        timing: MotherduckCacheAcquisitionTiming,
    ) => Promise<T>,
): Promise<T> => {
    const acquisition = await acquire(connectionString, ctx.projectUuid);
    const { entry } = acquisition;
    const timing: MotherduckCacheAcquisitionTiming = {
        waitMs: acquisition.waitMs,
        instanceCreateMs: acquisition.instanceCreateMs,
        connectMs: 0,
    };
    const observedInstance = new Proxy(entry.instance, {
        get: (target, property) => {
            if (property === 'connect') {
                return async () => {
                    const connectStart = performance.now();
                    try {
                        return await target.connect();
                    } finally {
                        timing.connectMs += performance.now() - connectStart;
                    }
                };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });

    try {
        const result = await fn(observedInstance, entry.entryId, timing);
        entry.consecutiveFailures = 0;
        return result;
    } catch (error) {
        entry.consecutiveFailures += 1;
        if (
            entry.consecutiveFailures >= options.maxConsecutiveFailures &&
            !entry.draining
        ) {
            void unlinkEntry(cacheKeyFor(connectionString), entry, 'failures');
        }
        throw error;
    } finally {
        entry.refCount -= 1;
        entry.lastUsedAt = performance.now();
        emit({
            type: 'acquire',
            result: acquisition.result,
            entryId: entry.entryId,
            projectUuid: ctx.projectUuid,
            waitMs: timing.waitMs,
            instanceCreateMs: timing.instanceCreateMs,
            connectMs: timing.connectMs,
        });
        if (entry.draining) {
            closeEntry(entry);
        }
    }
};

export const invalidate = async (
    entryId: string,
    reason: EvictionReason,
): Promise<void> => {
    const match = [...entries.entries()].find(
        ([, entry]) => entry.entryId === entryId,
    );
    if (match) {
        await unlinkEntry(match[0], match[1], reason);
    }
};

export const invalidateByConnectionString = (
    connectionString: string,
    reason: EvictionReason,
): void => {
    const key = cacheKeyFor(connectionString);
    const pending = pendingCreations.get(key);
    if (pending) {
        pending.invalidated = true;
        creationGenerations.set(key, (creationGenerations.get(key) ?? 0) + 1);
    }
    const entry = entries.get(key);
    if (entry) {
        void unlinkEntry(key, entry, reason);
    }
};

export const closeAll = async (reason: EvictionReason): Promise<void> => {
    await Promise.allSettled(
        [...pendingCreations.values()].map(({ promise }) => promise),
    );
    const draining = [...entries.entries()].map(([key, entry]) =>
        unlinkEntry(key, entry, reason),
    );
    await Promise.all(draining);
};

export const recordRetry = (
    entryId: string,
    outcome: 'recovered' | 'failed',
): void => {
    emit({ type: 'retry', entryId, outcome });
};

export const resetForTesting = (): void => {
    if (sweepTimer) {
        clearInterval(sweepTimer);
    }
    entries.forEach((entry) => {
        const drainingEntry = entry;
        drainingEntry.draining = true;
        closeEntry(drainingEntry);
    });
    entries.clear();
    pendingCreations.clear();
    creationGenerations.clear();
    options = DEFAULT_OPTIONS;
    observer = () => undefined;
    scheduleSweep();
};

export const MotherduckInstanceCache = {
    configure,
    setObserver,
    withInstance,
    invalidate,
    invalidateByConnectionString,
    recordRetry,
    closeAll,
    resetForTesting,
};

scheduleSweep();
