const APP_INITIATED_RELOAD_KEY = 'lightdash-app-initiated-reload';
const MAX_AGE_MS = 60_000;

// Cached so every caller in a page lifetime sees the same consumed value.
let consumedResult: boolean | null = null;

/**
 * Record that the app itself is about to force a page reload (new deploy,
 * chunk load error, build skew) so post-reload code can tell it apart from
 * a user-initiated refresh.
 */
export const markAppInitiatedReload = (): void => {
    try {
        sessionStorage.setItem(APP_INITIATED_RELOAD_KEY, Date.now().toString());
    } catch {
        // Storage unavailable; post-reload restore just won't trigger.
    }
};

/**
 * Whether this page load was caused by an app-initiated reload. Consumes the
 * marker on first call and caches the result for the rest of the page load.
 */
export const wasAppInitiatedReload = (): boolean => {
    if (consumedResult !== null) {
        return consumedResult;
    }

    try {
        const raw = sessionStorage.getItem(APP_INITIATED_RELOAD_KEY);
        sessionStorage.removeItem(APP_INITIATED_RELOAD_KEY);
        const markedAt = raw === null ? NaN : parseInt(raw, 10);
        consumedResult =
            Number.isFinite(markedAt) && Date.now() - markedAt <= MAX_AGE_MS;
    } catch {
        consumedResult = false;
    }

    return consumedResult;
};
