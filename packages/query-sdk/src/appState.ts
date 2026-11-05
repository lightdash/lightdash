/**
 * Durable app state — values a data app saves through Lightdash so they come
 * back on the next open, on any device.
 *
 *   const [filters, setFilters] = useAppState('filters', defaults);        // per person
 *   const [targets, setTargets] = useSharedAppState('targets', defaults);  // everyone
 *
 * Per-user values overwrite in place. Shared values carry a version per write
 * and a history of who changed what; a write made against a stale version is
 * retried when the setter was given an updater function, and surfaced as an
 * error when it was given a plain value.
 *
 * One store per transport: the first hook loads the whole snapshot once,
 * every hook reads from it, and writes coalesce per key before persisting.
 * When the store cannot persist (feature off, no app context in local dev,
 * network down) the hooks keep working in memory for the session.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useOptionalTransport } from './LightdashProvider';
import type {
    AppStateAuthor,
    AppStateErrorCode,
    AppStateErrorPayload,
    AppStateHistoryEntry,
    AppStateHistoryOptions,
    AppStateSharedEntry,
    AppStateTransport,
    AppStateUserEntry,
    Transport,
} from './types';
import { parseUrlStateSeed, setUrlStateKey } from './urlState';

export class AppStateError extends Error {
    readonly code: AppStateErrorCode;

    /** On `conflict`: what the shared key holds now (null when deleted). */
    readonly current: AppStateSharedEntry | null;

    constructor(
        code: AppStateErrorCode,
        message: string,
        current: AppStateSharedEntry | null = null,
    ) {
        super(message);
        this.name = 'AppStateError';
        this.code = code;
        this.current = current;
    }

    static fromPayload(payload: AppStateErrorPayload): AppStateError {
        return new AppStateError(
            payload.code,
            payload.message,
            payload.current ?? null,
        );
    }
}

export const toAppStateError = (error: unknown): AppStateError =>
    error instanceof AppStateError
        ? error
        : new AppStateError(
              'unknown',
              error instanceof Error ? error.message : String(error),
          );

/** Bursts of setter calls within this window become one write. */
export const APP_STATE_COALESCE_MS = 300;
const MAX_CONFLICT_RETRIES = 3;

export type AppStateStatus =
    /** Snapshot not requested yet. */
    | 'idle'
    | 'loading'
    /** Snapshot loaded; writes persist. */
    | 'ready'
    /** Nothing persists: feature off, no app context, or the load failed. */
    | 'memory';

type Updater = (prev: unknown) => unknown;
type Intent = { kind: 'value'; value: unknown } | { kind: 'updater'; fn: Updater };

export type AppStateStoreState = {
    status: AppStateStatus;
    /** Why the store is in memory-only mode, when it is. */
    error: AppStateError | null;
    user: Record<string, AppStateUserEntry>;
    shared: Record<string, AppStateSharedEntry>;
    /** Last failure per `${scope}:${key}`; cleared by the next successful write. */
    keyErrors: Record<string, AppStateError>;
};

export type AppStateStore = {
    getState: () => AppStateStoreState;
    subscribe: (listener: () => void) => () => void;
    /** Loads the snapshot once; later calls return the same promise. */
    load: () => Promise<void>;
    /** Value a `useAppState` hook should show: URL state first (see below). */
    getUserValue: (key: string) => unknown;
    /** True when the key's latest value is confirmed stored. */
    isSaved: (scope: 'user' | 'shared', key: string) => boolean;
    setUser: (key: string, value: unknown) => void;
    setShared: (key: string, next: unknown | Updater, fallback: unknown) => void;
    deleteUser: (key: string) => Promise<void>;
    deleteShared: (key: string) => Promise<void>;
    history: (
        key: string,
        options?: AppStateHistoryOptions,
    ) => Promise<AppStateHistoryEntry[]>;
    /**
     * Re-fetch the snapshot, e.g. to pick up other people's shared edits.
     * Also retries a load that failed earlier.
     */
    refresh: () => Promise<void>;
    /** Persist every pending write now. */
    flush: () => Promise<void>;
    /** Publish this key's saved value into URL state once it has loaded. */
    mirrorToUrl: (key: string) => void;
};

const isUpdater = (next: unknown): next is Updater => typeof next === 'function';

// Round-trips through JSON so what the app holds is exactly what persists
// (drops undefined fields, Dates become strings) and the value is
// structured-cloneable for postMessage.
const normalize = (value: unknown): unknown => {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : JSON.parse(serialized);
};

const replay = (intents: Intent[], base: unknown): unknown =>
    intents.reduce<unknown>(
        (acc, intent) =>
            intent.kind === 'value' ? intent.value : intent.fn(acc),
        base,
    );

const without = <T>(record: Record<string, T>, id: string): Record<string, T> =>
    Object.fromEntries(Object.entries(record).filter(([k]) => k !== id));

/**
 * Minimal external store: synchronous reads for useSyncExternalStore,
 * optimistic local writes, coalesced persistence with conflict retry.
 *
 * Writes to one key run strictly in order on a per-key chain, so a slow
 * earlier save can never land after a later one and a delete waits for the
 * save before it. The first change to a key is sent right away; changes made
 * while that save is in flight are sent after it, so at most one short
 * trailing write is ever unsent. Pending values are kept until the server
 * confirms them, so a failed save is retried by the next flush.
 * Exported for tests — app code uses the hooks.
 */
export function createAppStateStore(options: {
    transport: AppStateTransport | null;
    coalesceMs?: number;
    /** URL state seed; a key present here wins over the saved per-user value. */
    urlSeed?: Record<string, unknown>;
    /** Publishes a per-user value into URL state (`useAppState` `url` option). */
    publishUrl?: (key: string, value: unknown) => void;
    warn?: (message: string) => void;
}): AppStateStore {
    const {
        transport,
        coalesceMs = APP_STATE_COALESCE_MS,
        urlSeed = {},
        publishUrl = () => {},
        warn = (message) => {
            // eslint-disable-next-line no-console
            console.warn(`[lightdash] ${message}`);
        },
    } = options;

    let state: AppStateStoreState = {
        status: 'idle',
        error: null,
        user: {},
        shared: {},
        keyErrors: {},
    };
    const listeners = new Set<() => void>();
    const emit = (next: AppStateStoreState) => {
        state = next;
        listeners.forEach((listener) => listener());
    };

    // Server-confirmed shared entries: the base for versions and retries.
    const confirmedShared = new Map<string, AppStateSharedEntry>();
    // Unconfirmed writes, kept until the server accepts them.
    const pendingUser = new Map<string, unknown>();
    const pendingShared = new Map<string, Intent[]>();
    // Per-key operation chains (saves and deletes run in order).
    const chains = new Map<string, Promise<void>>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    // Keys deleted before the snapshot arrived; the snapshot must not revive them.
    const tombstones = new Set<string>();
    // Keys written this session; a URL-seeded key stops following the URL
    // once the app sets it.
    const touched = new Set<string>();
    const urlMirrored = new Set<string>();
    const urlPublished = new Set<string>();

    let loadPromise: Promise<void> | null = null;

    const setKeyError = (id: string, error: AppStateError | null) => {
        emit({
            ...state,
            keyErrors: error
                ? { ...state.keyErrors, [id]: error }
                : without(state.keyErrors, id),
        });
    };

    const mirrorIfLoaded = (key: string) => {
        if (
            state.status !== 'ready' ||
            touched.has(key) ||
            key in urlSeed ||
            urlPublished.has(key)
        ) {
            return;
        }
        const entry = state.user[key];
        if (entry) {
            urlPublished.add(key);
            publishUrl(key, entry.value);
        }
    };

    // Memory mode after a failed load still holds pending writes so a later
    // refresh() can persist them; nothing is kept when nothing ever will.
    const persistenceImpossible = () =>
        !transport || state.error?.code === 'feature_disabled';

    const load = (): Promise<void> => {
        if (loadPromise) return loadPromise;
        if (!transport) {
            warn(
                'Saved app state is kept in memory only: no app context. Set VITE_LIGHTDASH_APP_UUID in local development to use the store.',
            );
            emit({ ...state, status: 'memory' });
            loadPromise = Promise.resolve();
            return loadPromise;
        }
        emit({ ...state, status: 'loading' });
        loadPromise = transport
            .getSnapshot()
            .then((snapshot) => {
                confirmedShared.clear();
                Object.entries(snapshot.shared).forEach(([key, entry]) =>
                    confirmedShared.set(key, entry),
                );
                // Local writes and deletes made while loading win over the
                // snapshot.
                const user = { ...snapshot.user };
                const shared = { ...snapshot.shared };
                tombstones.forEach((id) => {
                    const [scope, ...rest] = id.split(':');
                    const key = rest.join(':');
                    if (scope === 'user') delete user[key];
                    else delete shared[key];
                });
                tombstones.clear();
                pendingUser.forEach((value, key) => {
                    user[key] = { value, updatedAt: new Date().toISOString() };
                });
                pendingShared.forEach((intents, key) => {
                    const base = snapshot.shared[key];
                    shared[key] = {
                        version: base?.version ?? 0,
                        updatedAt: base?.updatedAt ?? new Date().toISOString(),
                        updatedBy: base?.updatedBy ?? null,
                        value: replay(intents, base?.value),
                    };
                });
                emit({ ...state, status: 'ready', error: null, user, shared });
                urlPublished.clear();
                urlMirrored.forEach(mirrorIfLoaded);
                // Writes made before the store was ready go out now.
                pendingUser.forEach((_, key) => schedule('user', key));
                pendingShared.forEach((_, key) => schedule('shared', key));
            })
            .catch((error: unknown) => {
                const appError = toAppStateError(error);
                warn(
                    appError.code === 'feature_disabled'
                        ? 'Saved app state is not enabled for this organization; values are kept in memory for this session.'
                        : `Saved app state could not be loaded (${appError.message}); values are kept in memory until refresh() succeeds.`,
                );
                emit({ ...state, status: 'memory', error: appError });
            });
        return loadPromise;
    };

    const canPersist = () => transport !== null && state.status === 'ready';

    const flushUser = async (key: string): Promise<void> => {
        if (!pendingUser.has(key)) return;
        const value = pendingUser.get(key);
        if (!canPersist() || !transport) {
            if (persistenceImpossible()) pendingUser.delete(key);
            return;
        }
        try {
            const entry = await transport.setUser(key, value);
            if (pendingUser.get(key) === value) {
                pendingUser.delete(key);
                emit({
                    ...state,
                    user: { ...state.user, [key]: entry },
                    keyErrors: without(state.keyErrors, `user:${key}`),
                });
            }
            // Otherwise a newer value is pending and its own flush follows.
        } catch (error) {
            // Keep the pending value: the next flush retries it.
            setKeyError(`user:${key}`, toAppStateError(error));
        }
    };

    const flushShared = async (key: string): Promise<void> => {
        const intents = pendingShared.get(key);
        if (!intents || intents.length === 0) return;
        if (!canPersist() || !transport) {
            if (persistenceImpossible()) pendingShared.delete(key);
            return;
        }
        const settle = () => {
            const remaining = (pendingShared.get(key) ?? []).slice(
                intents.length,
            );
            if (remaining.length > 0) pendingShared.set(key, remaining);
            else pendingShared.delete(key);
            return remaining.length > 0;
        };

        for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
            const base = confirmedShared.get(key);
            const value = normalize(replay(intents, base?.value));
            try {
                // eslint-disable-next-line no-await-in-loop
                const entry = await transport.setShared(
                    key,
                    value,
                    base?.version ?? null,
                );
                confirmedShared.set(key, entry);
                const newerPending = settle();
                emit({
                    ...state,
                    // A newer local edit is showing; keep it until its flush.
                    shared: newerPending
                        ? state.shared
                        : { ...state.shared, [key]: entry },
                    keyErrors: without(state.keyErrors, `shared:${key}`),
                });
                return;
            } catch (error) {
                const appError = toAppStateError(error);
                if (appError.code !== 'conflict') {
                    // Keep the intents: the next flush retries them.
                    setKeyError(`shared:${key}`, appError);
                    return;
                }
                if (appError.current) {
                    confirmedShared.set(key, appError.current);
                } else {
                    confirmedShared.delete(key);
                }
                const onlyUpdaters = intents.every((i) => i.kind === 'updater');
                if (!onlyUpdaters || attempt === MAX_CONFLICT_RETRIES) {
                    // Show what the server has; the app decides what to do.
                    settle();
                    const shared = { ...state.shared };
                    if (appError.current) shared[key] = appError.current;
                    else delete shared[key];
                    emit({
                        ...state,
                        shared,
                        keyErrors: {
                            ...state.keyErrors,
                            [`shared:${key}`]: appError,
                        },
                    });
                    return;
                }
            }
        }
    };

    const enqueue = (id: string, task: () => Promise<void>): Promise<void> => {
        const previous = chains.get(id) ?? Promise.resolve();
        const run = previous.then(task, task);
        chains.set(id, run);
        void run.finally(() => {
            if (chains.get(id) === run) chains.delete(id);
        });
        return run;
    };

    const flushKey = (id: string) => {
        const [scope, ...rest] = id.split(':');
        const key = rest.join(':');
        return enqueue(id, () =>
            load().then(() =>
                scope === 'user' ? flushUser(key) : flushShared(key),
            ),
        );
    };

    // First change goes out at once (next tick, so same-tick bursts merge);
    // changes made while a save is in flight wait for the coalescing window.
    const schedule = (scope: 'user' | 'shared', key: string) => {
        const id = `${scope}:${key}`;
        if (timers.has(id)) return;
        const delay = chains.has(id) ? coalesceMs : 0;
        timers.set(
            id,
            setTimeout(() => {
                timers.delete(id);
                void flushKey(id);
            }, delay),
        );
    };

    const flush = async (): Promise<void> => {
        timers.forEach((timer, id) => {
            clearTimeout(timer);
            timers.delete(id);
        });
        [...pendingUser.keys()].forEach((key) => flushKey(`user:${key}`));
        [...pendingShared.keys()].forEach((key) => flushKey(`shared:${key}`));
        await Promise.all([...chains.values()]);
    };

    const remove = (scope: 'user' | 'shared', key: string): Promise<void> => {
        const id = `${scope}:${key}`;
        touched.add(key);
        const timer = timers.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.delete(id);
        }
        if (scope === 'user') pendingUser.delete(key);
        else {
            pendingShared.delete(key);
            confirmedShared.delete(key);
        }
        if (state.status !== 'ready') tombstones.add(id);
        emit({
            ...state,
            user: scope === 'user' ? without(state.user, key) : state.user,
            shared:
                scope === 'shared' ? without(state.shared, key) : state.shared,
            keyErrors: without(state.keyErrors, id),
        });
        // Runs after any save already in flight for this key.
        return enqueue(id, async () => {
            await load();
            if (!canPersist() || !transport) return;
            if (scope === 'user') await transport.deleteUser(key);
            else await transport.deleteShared(key);
        });
    };

    return {
        getState: () => state,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        load,
        getUserValue: (key) => {
            if (!touched.has(key) && key in urlSeed) return urlSeed[key];
            return state.user[key]?.value;
        },
        isSaved: (scope, key) =>
            state.status === 'ready' &&
            !state.keyErrors[`${scope}:${key}`] &&
            !(scope === 'user'
                ? pendingUser.has(key)
                : pendingShared.has(key)),
        setUser: (key, value) => {
            touched.add(key);
            tombstones.delete(`user:${key}`);
            const normalized = normalize(value);
            pendingUser.set(key, normalized);
            emit({
                ...state,
                user: {
                    ...state.user,
                    [key]: {
                        value: normalized,
                        updatedAt: new Date().toISOString(),
                    },
                },
            });
            schedule('user', key);
        },
        setShared: (key, next, fallback) => {
            tombstones.delete(`shared:${key}`);
            const intent: Intent = isUpdater(next)
                ? { kind: 'updater', fn: next }
                : { kind: 'value', value: normalize(next) };
            pendingShared.set(key, [...(pendingShared.get(key) ?? []), intent]);
            const current = state.shared[key];
            const value = normalize(
                intent.kind === 'value'
                    ? intent.value
                    : intent.fn(current ? current.value : fallback),
            );
            emit({
                ...state,
                shared: {
                    ...state.shared,
                    [key]: {
                        version: current?.version ?? 0,
                        updatedAt: new Date().toISOString(),
                        updatedBy: current?.updatedBy ?? null,
                        value,
                    },
                },
            });
            schedule('shared', key);
        },
        deleteUser: (key) => remove('user', key),
        deleteShared: (key) => remove('shared', key),
        history: async (key, options = {}) => {
            await load();
            if (!canPersist() || !transport) return [];
            return transport.getSharedHistory(key, options);
        },
        refresh: async () => {
            await flush();
            if (!transport || state.error?.code === 'feature_disabled') return;
            loadPromise = null;
            await load();
        },
        flush,
        mirrorToUrl: (key) => {
            urlMirrored.add(key);
            mirrorIfLoaded(key);
        },
    };
}

// One store per transport, created on first use. WeakMap so a transport that
// goes away takes its store with it (tests create many).
const stores = new WeakMap<Transport, AppStateStore>();

/** Shared edits by other people are picked up when the tab comes back. */
const VISIBLE_REFRESH_MIN_INTERVAL_MS = 15_000;

export function getAppStateStore(transport: Transport): AppStateStore {
    let store = stores.get(transport);
    if (!store) {
        const created = createAppStateStore({
            transport: transport.appState ?? null,
            urlSeed:
                typeof window === 'undefined'
                    ? {}
                    : parseUrlStateSeed(window.location),
            publishUrl: setUrlStateKey,
        });
        store = created;
        stores.set(transport, created);
        void created.load();
        if (typeof window !== 'undefined') {
            // Persist what is still pending when the tab goes away or is
            // hidden; the host sends these with keepalive so they outlive
            // the page.
            window.addEventListener('pagehide', () => {
                void created.flush();
            });
            let lastRefresh = Date.now();
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    void created.flush();
                } else if (
                    created.getState().status === 'ready' &&
                    Date.now() - lastRefresh > VISIBLE_REFRESH_MIN_INTERVAL_MS
                ) {
                    lastRefresh = Date.now();
                    void created.refresh();
                }
            });
        }
    }
    return store;
}

const jsonKind = (value: unknown): string => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
};

/**
 * A saved value of a different JSON kind than the default (an object where
 * the app now expects an array, a string where it expects a number) is from
 * an older build of the app; show the default instead of breaking the app.
 */
export const matchesDefaultShape = (saved: unknown, fallback: unknown): boolean =>
    fallback === null || fallback === undefined
        ? true
        : jsonKind(saved) === jsonKind(fallback);

export type AppStateMeta = {
    /** True until the first snapshot has loaded (or failed). */
    loading: boolean;
    /** Last failure for this key, or why nothing persists. */
    error: AppStateError | null;
    /**
     * Whether the store can persist at all: false while it is memory-only
     * (feature off, no app context, load failed). Says nothing about this
     * key's latest value; use `saved` for that.
     */
    persisted: boolean;
    /** True when this key's latest value is confirmed stored by the server. */
    saved: boolean;
};

export type SharedAppStateMeta = AppStateMeta & {
    version: number | null;
    updatedAt: string | null;
    updatedBy: AppStateAuthor | null;
};

function useStore(): AppStateStore {
    const transport = useOptionalTransport();
    if (!transport) {
        throw new Error(
            'useAppState must be used inside <LightdashProvider>. ' +
                'Wrap your app in <LightdashProvider client={...}>.',
        );
    }
    return getAppStateStore(transport);
}

const useStoreState = (store: AppStateStore): AppStateStoreState =>
    useSyncExternalStore(store.subscribe, store.getState, store.getState);

export type AppStateOptions = {
    /**
     * Also keep the value in the page URL (`useUrlState`), so the control is
     * both remembered for the person and part of the shareable link. A value
     * in the link wins until the person changes the control.
     */
    url?: boolean;
};

/**
 * `useState`-shaped hook whose value is saved for the current person and
 * comes back on their next open, on any device.
 *
 *   const [period, setPeriod] = useAppState('period', 'last_month');
 *   const [tab, setTab] = useAppState('tab', 'overview', { url: true });
 *
 * Values must be JSON. A value in the page URL for the same key wins until
 * the app sets the key, so a shared link still opens the view it points at.
 */
export function useAppState<T>(
    key: string,
    defaultValue: T,
    options: AppStateOptions = {},
): [T, (next: T | ((prev: T) => T)) => void, AppStateMeta] {
    const store = useStore();
    const mirrorToUrl = options.url === true;
    const snapshot = useStoreState(store);
    useEffect(() => {
        // A restored value also lands in the link, so copying the address
        // bar reproduces the view the person is looking at.
        if (mirrorToUrl) store.mirrorToUrl(key);
    }, [store, key, mirrorToUrl]);
    const raw = store.getUserValue(key);
    const value = (
        raw === undefined || !matchesDefaultShape(raw, defaultValue)
            ? defaultValue
            : raw
    ) as T;

    const set = useCallback(
        (next: T | ((prev: T) => T)) => {
            const prevRaw = store.getUserValue(key);
            const prev = (
                prevRaw === undefined || !matchesDefaultShape(prevRaw, defaultValue)
                    ? defaultValue
                    : prevRaw
            ) as T;
            const value =
                typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
            store.setUser(key, value);
            if (mirrorToUrl) setUrlStateKey(key, value);
        },
        // defaultValue is read at call time on purpose; a fresh literal per
        // render must not churn the setter identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [store, key, mirrorToUrl],
    );

    return [
        value,
        set,
        {
            loading: snapshot.status === 'idle' || snapshot.status === 'loading',
            error: snapshot.keyErrors[`user:${key}`] ?? snapshot.error,
            persisted: snapshot.status === 'ready',
            saved: store.isSaved('user', key),
        },
    ];
}

/**
 * `useState`-shaped hook for a value every viewer of the app shares, with a
 * version per write and a history of who changed it.
 *
 *   const [targets, setTargets] = useSharedAppState('targets', {});
 *   setTargets((prev) => ({ ...prev, q3: 120 }));   // retried on conflict
 *   setTargets(next);                                // errors on conflict
 */
export function useSharedAppState<T>(
    key: string,
    defaultValue: T,
): [T, (next: T | ((prev: T) => T)) => void, SharedAppStateMeta] {
    const store = useStore();
    const snapshot = useStoreState(store);
    const entry = snapshot.shared[key];
    const value = (
        entry === undefined || !matchesDefaultShape(entry.value, defaultValue)
            ? defaultValue
            : entry.value
    ) as T;

    const set = useCallback(
        (next: T | ((prev: T) => T)) => {
            if (typeof next === 'function') {
                const fn = next as (p: T) => T;
                store.setShared(
                    key,
                    (prev: unknown) =>
                        fn(
                            (prev === undefined ||
                            !matchesDefaultShape(prev, defaultValue)
                                ? defaultValue
                                : prev) as T,
                        ),
                    defaultValue,
                );
            } else {
                store.setShared(key, next, defaultValue);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [store, key],
    );

    return [
        value,
        set,
        {
            loading: snapshot.status === 'idle' || snapshot.status === 'loading',
            error: snapshot.keyErrors[`shared:${key}`] ?? snapshot.error,
            persisted: snapshot.status === 'ready',
            saved: store.isSaved('shared', key),
            version: entry?.version ?? null,
            updatedAt: entry?.updatedAt ?? null,
            updatedBy: entry?.updatedBy ?? null,
        },
    ];
}
