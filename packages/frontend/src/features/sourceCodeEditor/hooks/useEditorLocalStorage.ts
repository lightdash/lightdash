import { useCallback, useEffect, useRef } from 'react';

const STORAGE_KEYS = {
    LAST_FILE: 'lightdash:editor:lastFile',
    LAST_BRANCH: 'lightdash:editor:lastBranch',
    UNSAVED_CONTENT: 'lightdash:editor:unsavedContent',
} as const;

interface UnsavedContent {
    projectUuid: string;
    branch: string;
    filePath: string;
    content: string;
    originalSha: string | null;
    savedAt: number;
}

// How long to keep unsaved content before considering it stale (24 hours)
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Hook for managing editor state in local storage
 * - Saves unsaved changes for crash recovery
 * - Remembers last viewed file and branch
 */
export const useEditorLocalStorage = (projectUuid: string | undefined) => {
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Save unsaved content to local storage (debounced)
    const saveUnsavedContent = useCallback(
        (
            branch: string,
            filePath: string,
            content: string,
            originalSha: string | null,
        ) => {
            if (!projectUuid) return;

            // Clear previous timeout
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }

            // Debounce the save operation
            debounceTimeoutRef.current = setTimeout(() => {
                const data: UnsavedContent = {
                    projectUuid,
                    branch,
                    filePath,
                    content,
                    originalSha,
                    savedAt: Date.now(),
                };
                try {
                    localStorage.setItem(
                        STORAGE_KEYS.UNSAVED_CONTENT,
                        JSON.stringify(data),
                    );
                } catch {
                    // localStorage might be full or disabled
                    console.warn(
                        'Failed to save unsaved content to local storage',
                    );
                }
            }, 1000);
        },
        [projectUuid],
    );

    // Clear unsaved content when changes are saved
    const clearUnsavedContent = useCallback(() => {
        localStorage.removeItem(STORAGE_KEYS.UNSAVED_CONTENT);
    }, []);

    // Get unsaved content for recovery
    const getUnsavedContent = useCallback((): UnsavedContent | null => {
        if (!projectUuid) return null;

        try {
            const stored = localStorage.getItem(STORAGE_KEYS.UNSAVED_CONTENT);
            if (!stored) return null;

            const data: UnsavedContent = JSON.parse(stored);

            // Check if it's for the current project
            if (data.projectUuid !== projectUuid) return null;

            // Check if it's stale
            if (Date.now() - data.savedAt > STALE_THRESHOLD_MS) {
                localStorage.removeItem(STORAGE_KEYS.UNSAVED_CONTENT);
                return null;
            }

            return data;
        } catch {
            // Invalid JSON or other error
            localStorage.removeItem(STORAGE_KEYS.UNSAVED_CONTENT);
            return null;
        }
    }, [projectUuid]);

    // Save last viewed file and branch
    const saveLastLocation = useCallback(
        (branch: string | null, filePath: string | null) => {
            if (!projectUuid) return;

            try {
                if (branch) {
                    localStorage.setItem(
                        `${STORAGE_KEYS.LAST_BRANCH}:${projectUuid}`,
                        branch,
                    );
                }
                if (filePath) {
                    localStorage.setItem(
                        `${STORAGE_KEYS.LAST_FILE}:${projectUuid}`,
                        filePath,
                    );
                }
            } catch {
                // localStorage might be full or disabled
            }
        },
        [projectUuid],
    );

    // Get last viewed location
    const getLastLocation = useCallback((): {
        branch: string | null;
        filePath: string | null;
    } => {
        if (!projectUuid) return { branch: null, filePath: null };

        try {
            const branch = localStorage.getItem(
                `${STORAGE_KEYS.LAST_BRANCH}:${projectUuid}`,
            );
            const filePath = localStorage.getItem(
                `${STORAGE_KEYS.LAST_FILE}:${projectUuid}`,
            );
            return { branch, filePath };
        } catch {
            return { branch: null, filePath: null };
        }
    }, [projectUuid]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, []);

    return {
        saveUnsavedContent,
        clearUnsavedContent,
        getUnsavedContent,
        saveLastLocation,
        getLastLocation,
    };
};
