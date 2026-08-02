/**
 * Shareable URL state — a keyed map of app view state that round-trips through
 * the host page's `state` query param, so the address bar is always a link to
 * the current view.
 *
 * Inside the Lightdash iframe the seed arrives synchronously in the hash
 * (written there by the host from its own `?state=`) and changes are posted to
 * the parent; top-level (local dev) the app reads and writes its own `?state=`.
 * See the "Shareable URL state" section of docs/data-apps.md.
 *
 * Seeded values come from a user-editable URL — treat them as untrusted.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';

export type UrlStateMap = Record<string, unknown>;

/** Iframe → parent. The host writes `state` into its page URL. */
export type SdkUrlStateChangeMessage = {
    type: 'lightdash:sdk:url-state-change';
    state: UrlStateMap;
};

export const URL_STATE_CHANGE_MESSAGE = 'lightdash:sdk:url-state-change';
export const URL_STATE_PARAM = 'state';

/** Keep in sync with the parent-side caps in useAppSdkBridge and
 *  useAppUrlStateSync (packages/frontend). */
export const MAX_URL_STATE_CHARS = 4096;

// Coalesces same-tick setKey bursts into one publish, no more: the host
// debounces its own URL writes and needs the latest state before any reload.
const PUBLISH_COALESCE_MS = 0;

const isPlainObject = (value: unknown): value is UrlStateMap =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parse the seed map. The iframe hash wins (that's where the host forwards its
 * `?state=`); the search param is the top-level fallback.
 */
export function parseUrlStateSeed(location: {
    hash: string;
    search: string;
}): UrlStateMap {
    const raw =
        new URLSearchParams(location.hash.replace(/^#/, '')).get(
            URL_STATE_PARAM,
        ) ?? new URLSearchParams(location.search).get(URL_STATE_PARAM);
    if (!raw || raw.length > MAX_URL_STATE_CHARS) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Serialize a state map, or null when it can't be published (non-JSON values,
 * or over the size cap). Warns so the author sees why state stopped persisting.
 */
export function serializeUrlState(state: UrlStateMap): string | null {
    let serialized: string;
    try {
        serialized = JSON.stringify(state);
    } catch {
        // eslint-disable-next-line no-console
        console.warn(
            '[lightdash] URL state must be JSON-serializable — not publishing',
        );
        return null;
    }
    if (serialized.length > MAX_URL_STATE_CHARS) {
        // eslint-disable-next-line no-console
        console.warn(
            `[lightdash] URL state exceeds ${MAX_URL_STATE_CHARS} chars serialized — not publishing`,
        );
        return null;
    }
    return serialized;
}

// Latched once: app code may later mutate the hash (anchor links, hash
// routing), and the delivery mode must not flip mid-session.
let postMessageModeCache: boolean | null = null;
const isPostMessageMode = (): boolean => {
    if (postMessageModeCache === null) {
        postMessageModeCache =
            typeof window !== 'undefined' &&
            new URLSearchParams(window.location.hash.replace(/^#/, '')).get(
                'transport',
            ) === 'postMessage';
    }
    return postMessageModeCache;
};

function publishUrlState(state: UrlStateMap): void {
    if (typeof window === 'undefined') return;
    const serialized = serializeUrlState(state);
    if (serialized === null) return;

    if (isPostMessageMode()) {
        const message: SdkUrlStateChangeMessage = {
            type: URL_STATE_CHANGE_MESSAGE,
            // Round-tripped so the payload is structured-cloneable: values
            // JSON.stringify drops would throw DataCloneError on postMessage.
            state: JSON.parse(serialized) as UrlStateMap,
        };
        window.parent?.postMessage(message, '*');
        return;
    }

    // Top-level (local dev): own the URL directly. Replace, not push — state
    // churn must not spam browser history.
    const url = new URL(window.location.href);
    if (Object.keys(state).length === 0) {
        url.searchParams.delete(URL_STATE_PARAM);
    } else {
        url.searchParams.set(URL_STATE_PARAM, serialized);
    }
    window.history.replaceState(window.history.state, '', url);
}

export type UrlStateStore = {
    getState: () => UrlStateMap;
    setKey: (key: string, value: unknown) => void;
    subscribe: (listener: () => void) => () => void;
};

/**
 * Minimal external store: synchronous reads for useSyncExternalStore, trailing-
 * edge publish on writes. Exported for tests — app code uses `useUrlState`.
 */
export function createUrlStateStore(options: {
    seed: UrlStateMap;
    publish: (state: UrlStateMap) => void;
    debounceMs?: number;
}): UrlStateStore {
    const { publish, debounceMs = PUBLISH_COALESCE_MS } = options;
    let state = options.seed;
    const listeners = new Set<() => void>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedulePublish = () => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            publish(state);
        }, debounceMs);
    };

    return {
        getState: () => state,
        setKey: (key, value) => {
            if (Object.is(state[key], value)) return;
            state = { ...state, [key]: value };
            listeners.forEach((listener) => listener());
            schedulePublish();
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

// Lazily created so tests (and SSR) never touch window at import time.
let sharedStore: UrlStateStore | null = null;
function getSharedStore(): UrlStateStore {
    if (sharedStore === null) {
        // Prime the transport-mode latch now — first hook call happens during
        // the first render, before any user interaction can mutate the hash.
        isPostMessageMode();
        sharedStore = createUrlStateStore({
            seed:
                typeof window === 'undefined'
                    ? {}
                    : parseUrlStateSeed(window.location),
            publish: publishUrlState,
        });
    }
    return sharedStore;
}

/**
 * `useState`-shaped hook whose value round-trips through the page URL:
 *
 *   const [period, setPeriod] = useUrlState('period', 'last_month');
 *
 * Values must be JSON-serializable. All call sites share one map keyed by
 * `key`, so no provider is needed.
 */
export function useUrlState<T>(
    key: string,
    defaultValue: T,
): [T, (next: T | ((prev: T) => T)) => void] {
    const store = getSharedStore();
    const raw = useSyncExternalStore(
        store.subscribe,
        () => store.getState()[key],
        () => undefined,
    );

    // Latest default in a ref so the setter identity is stable across renders.
    const defaultRef = useRef(defaultValue);
    defaultRef.current = defaultValue;

    const set = useCallback(
        (next: T | ((prev: T) => T)) => {
            const prev = store.getState()[key];
            const prevOrDefault = (
                prev === undefined ? defaultRef.current : prev
            ) as T;
            const value =
                typeof next === 'function'
                    ? (next as (p: T) => T)(prevOrDefault)
                    : next;
            store.setKey(key, value);
        },
        [store, key],
    );

    return [(raw === undefined ? defaultValue : raw) as T, set];
}
