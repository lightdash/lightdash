import { type CreateSavedChartVersion } from '@lightdash/common';
import { useCallback, useEffect, useRef } from 'react';
import {
    explorerActions,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';

const MAX_HISTORY_SIZE = 50;
const DEBOUNCE_MS = 300;

/**
 * Hook to provide undo functionality for the Explorer via the browser back button.
 *
 * Instead of pushing each state change to browser history (which would clutter it),
 * we maintain an internal history stack. When the user presses the browser back button,
 * we intercept the navigation and restore from our internal stack instead.
 *
 * When the internal stack is empty, we allow normal back navigation to leave the page.
 */
export const useExplorerHistory = () => {
    const dispatch = useExplorerDispatch();
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

    // Internal history stack - doesn't trigger re-renders
    const historyStackRef = useRef<CreateSavedChartVersion[]>([]);
    // Track the current state to compare for changes
    const currentStateRef = useRef<string | null>(null);
    // Debounce timer for pushing to history
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Flag to prevent adding to history when we're restoring from history
    const isRestoringRef = useRef(false);
    // Flag to track if we've pushed a "guard" entry to history
    const hasGuardEntryRef = useRef(false);

    // Push current state to our internal history stack (debounced)
    const pushToHistory = useCallback(
        (chartVersion: CreateSavedChartVersion) => {
            if (isRestoringRef.current) return;

            // Clear any pending debounce
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            debounceTimerRef.current = setTimeout(() => {
                const serialized = JSON.stringify(chartVersion);

                // Don't push if it's the same as the last entry
                const lastEntry =
                    historyStackRef.current[
                        historyStackRef.current.length - 1
                    ];
                if (lastEntry && JSON.stringify(lastEntry) === serialized) {
                    return;
                }

                // Don't push if it's the same as current state (initial load)
                if (currentStateRef.current === serialized) {
                    return;
                }

                // Save the previous state before updating current
                if (currentStateRef.current) {
                    try {
                        const previousState = JSON.parse(
                            currentStateRef.current,
                        ) as CreateSavedChartVersion;
                        historyStackRef.current.push(previousState);

                        // Limit history size
                        if (historyStackRef.current.length > MAX_HISTORY_SIZE) {
                            historyStackRef.current.shift();
                        }

                        // Push a "guard" entry to browser history so back button works
                        // We only need one guard entry, not one per state change
                        if (!hasGuardEntryRef.current) {
                            window.history.pushState(
                                { explorerGuard: true },
                                '',
                            );
                            hasGuardEntryRef.current = true;
                        }
                    } catch {
                        // Ignore JSON parse errors
                    }
                }

                currentStateRef.current = serialized;
            }, DEBOUNCE_MS);
        },
        [],
    );

    // Handle popstate (browser back/forward)
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            // Check if this is our guard entry or has explorer history
            if (historyStackRef.current.length > 0) {
                // Prevent navigation - restore from our stack instead
                event.preventDefault();

                const previousState = historyStackRef.current.pop();
                if (previousState) {
                    isRestoringRef.current = true;

                    // Update current state ref
                    currentStateRef.current = JSON.stringify(previousState);

                    // Restore the state via Redux
                    dispatch(
                        explorerActions.setUnsavedChartVersion(previousState),
                    );

                    // If we still have history, push guard back
                    // If not, clear the guard flag so next change creates one
                    if (historyStackRef.current.length > 0) {
                        window.history.pushState({ explorerGuard: true }, '');
                    } else {
                        hasGuardEntryRef.current = false;
                    }

                    // Reset restoring flag after a tick
                    setTimeout(() => {
                        isRestoringRef.current = false;
                    }, 0);
                }
            }
            // If no history in our stack, let the browser navigate normally
        };

        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [dispatch]);

    // Track state changes
    useEffect(() => {
        if (unsavedChartVersion) {
            pushToHistory(unsavedChartVersion);
        }
    }, [unsavedChartVersion, pushToHistory]);

    // Expose undo function for programmatic use (e.g., Ctrl+Z)
    const undo = useCallback(() => {
        if (historyStackRef.current.length > 0) {
            const previousState = historyStackRef.current.pop();
            if (previousState) {
                isRestoringRef.current = true;
                currentStateRef.current = JSON.stringify(previousState);
                dispatch(explorerActions.setUnsavedChartVersion(previousState));

                if (historyStackRef.current.length === 0) {
                    hasGuardEntryRef.current = false;
                }

                setTimeout(() => {
                    isRestoringRef.current = false;
                }, 0);
            }
        }
    }, [dispatch]);

    const canUndo = historyStackRef.current.length > 0;

    return { undo, canUndo };
};
