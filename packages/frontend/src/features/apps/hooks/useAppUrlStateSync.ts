import { useCallback, useEffect, useRef } from 'react';

const URL_STATE_PARAM = 'state';

// Keep in sync with MAX_URL_STATE_CHARS in packages/query-sdk/src/urlState.ts
// and useAppSdkBridge. Applied on BOTH directions: the write-back cap bounds
// what an app can push into browser history, and the seed cap keeps a crafted
// ?state= from inflating the iframe URL past browser limits.
const MAX_URL_STATE_CHARS = 4096;

// Rate-limits history.replaceState (Safari throttles ~100 writes/30s). Only
// the URL write is debounced — the in-memory latest state updates on every
// change so iframe reloads always re-seed the current view.
const URL_WRITE_DEBOUNCE_MS = 300;

const parseValidatedState = (
    raw: string | null,
): Record<string, unknown> | null => {
    if (!raw || raw.length > MAX_URL_STATE_CHARS) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
};

/** The page's ?state= param parsed to a map, or null when absent/oversized/invalid. */
export const readAppUrlState = (): Record<string, unknown> | null =>
    parseValidatedState(
        new URLSearchParams(window.location.search).get(URL_STATE_PARAM),
    );

/** The page's ?state= param, or null when absent/oversized/not a JSON map. */
const readValidatedSeed = (): string | null => {
    const raw = new URLSearchParams(window.location.search).get(
        URL_STATE_PARAM,
    );
    return parseValidatedState(raw) ? raw : null;
};

const writeUrlStateParam = (encoded: string | null) => {
    const url = new URL(window.location.href);
    if (encoded === null) {
        url.searchParams.delete(URL_STATE_PARAM);
    } else {
        url.searchParams.set(URL_STATE_PARAM, encoded);
    }
    window.history.replaceState(window.history.state, '', url);
};

/**
 * Host-side half of data-app shareable URL state, used by `AppIframePreview`
 * when the host opts in via `urlStateSync`: `applySeed` appends the latest
 * known state to the iframe URL, `handleUrlStateChange` mirrors the app's
 * changes back into the page's `?state=`. State is tagged with the app it came
 * from, so switching apps drops it. See docs/data-apps.md.
 */
export function useAppUrlStateSync({
    appUuid,
    enabled,
}: {
    appUuid: string;
    enabled: boolean;
}) {
    // Latest known state, tagged with the app it belongs to. Initialized from
    // the page URL for the app the page was opened on.
    const stateRef = useRef<{ appUuid: string; encoded: string | null } | null>(
        null,
    );
    if (enabled && stateRef.current === null) {
        stateRef.current = { appUuid, encoded: readValidatedSeed() };
    }

    // Latest appUuid in a ref so the callbacks stay identity-stable.
    const appUuidRef = useRef(appUuid);
    appUuidRef.current = appUuid;

    const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelPendingWrite = useCallback(() => {
        if (writeTimerRef.current !== null) {
            clearTimeout(writeTimerRef.current);
            writeTimerRef.current = null;
        }
    }, []);

    // Cancel any pending URL write on unmount — firing after a route change
    // would stamp ?state= onto an unrelated page's URL.
    useEffect(() => cancelPendingWrite, [cancelPendingWrite]);

    // App switch: the previous app's state no longer applies. Drop it and
    // clear the page's ?state= so the URL doesn't claim a view of the old app.
    useEffect(() => {
        if (!enabled) return;
        const current = stateRef.current;
        if (current && current.appUuid !== appUuid) {
            stateRef.current = { appUuid, encoded: null };
            cancelPendingWrite();
            writeUrlStateParam(null);
        }
    }, [enabled, appUuid, cancelPendingWrite]);

    const handleUrlStateChange = useCallback(
        (state: Record<string, unknown>) => {
            // Already validated by the bridge (plain object, size-capped).
            const encoded =
                Object.keys(state).length > 0 ? JSON.stringify(state) : null;
            stateRef.current = { appUuid: appUuidRef.current, encoded };
            cancelPendingWrite();
            writeTimerRef.current = setTimeout(() => {
                writeTimerRef.current = null;
                writeUrlStateParam(encoded);
            }, URL_WRITE_DEBOUNCE_MS);
        },
        [cancelPendingWrite],
    );

    /** Append the latest state for this app to an iframe base URL (which must
     *  already contain a hash fragment). Memoize on the base URL. */
    const applySeed = useCallback((baseUrl: string): string => {
        const current = stateRef.current;
        const encoded =
            current && current.appUuid === appUuidRef.current
                ? current.encoded
                : null;
        return encoded
            ? `${baseUrl}&state=${encodeURIComponent(encoded)}`
            : baseUrl;
    }, []);

    return { applySeed, handleUrlStateChange };
}
