const CHUNK_ERROR_RELOAD_KEY = 'lightdash-chunk-error-reload';
const RELOAD_COOLDOWN_MS = 60_000; // 60 seconds before allowing another auto-reload

const CHUNK_ERROR_MESSAGES = [
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'Failed to load module script',
    'Unable to preload CSS',
];

let isChunkLoadErrorHandlerInstalled = false;

export const isChunkLoadError = (message: string): boolean => {
    const normalizedMessage = message.toLowerCase();
    return CHUNK_ERROR_MESSAGES.some((chunkErrorMessage) =>
        normalizedMessage.includes(chunkErrorMessage.toLowerCase()),
    );
};

export const isChunkLoadErrorObject = (error: unknown): boolean => {
    if (error instanceof Error) {
        return isChunkLoadError(error.message);
    }
    return false;
};

/**
 * Check if we've recently attempted an auto-reload for chunk errors.
 * Used by ErrorBoundary to decide whether to auto-reload or show manual refresh UI.
 */
export const hasRecentChunkReload = (): boolean => {
    try {
        const reloadTimestamp = sessionStorage.getItem(CHUNK_ERROR_RELOAD_KEY);
        if (!reloadTimestamp) {
            return false;
        }

        const reloadTime = parseInt(reloadTimestamp, 10);

        if (isNaN(reloadTime) || Date.now() - reloadTime > RELOAD_COOLDOWN_MS) {
            sessionStorage.removeItem(CHUNK_ERROR_RELOAD_KEY);
            return false;
        }

        return true;
    } catch {
        // sessionStorage may throw in private browsing or when storage is disabled.
        // Return true to skip auto-reload and show manual refresh UI (avoids infinite loop).
        return true;
    }
};

/**
 * Trigger an auto-reload for a chunk error.
 * Sets sessionStorage flag to prevent infinite loops.
 */
export const triggerChunkErrorReload = (): void => {
    try {
        sessionStorage.setItem(CHUNK_ERROR_RELOAD_KEY, Date.now().toString());
    } catch {
        // sessionStorage may throw in private browsing or when storage is disabled.
        // Proceed with reload anyway - worst case user sees manual refresh UI.
    }
    window.location.reload();
};

const reloadOnceForChunkError = (): boolean => {
    if (hasRecentChunkReload()) {
        return false;
    }

    triggerChunkErrorReload();
    return true;
};

export const installChunkLoadErrorHandler = (): void => {
    if (typeof window === 'undefined' || isChunkLoadErrorHandlerInstalled) {
        return;
    }

    isChunkLoadErrorHandlerInstalled = true;

    window.addEventListener('vite:preloadError', (event) => {
        if (reloadOnceForChunkError()) {
            event.preventDefault();
        }
    });

    window.addEventListener('unhandledrejection', (event) => {
        if (!isChunkLoadErrorObject(event.reason)) {
            return;
        }

        if (reloadOnceForChunkError()) {
            event.preventDefault();
        }
    });
};
