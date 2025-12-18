const CHUNK_ERROR_RELOAD_KEY = 'lightdash-chunk-error-reload';
const RELOAD_COOLDOWN_MS = 60_000; // 60 seconds before allowing another auto-reload

const CHUNK_ERROR_MESSAGE = 'Failed to fetch dynamically imported module';

export const isChunkLoadError = (message: string): boolean => {
    return message.includes(CHUNK_ERROR_MESSAGE);
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
