import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Hook return type for managing a stack of modals
 */
export interface UseMantineModalStackReturnType<T extends string> {
    /**
     * Current opened state of each modal
     */
    state: Record<T, boolean>;

    /**
     * Opens modal with the given id
     */
    open: (id: T) => void;

    /**
     * Closes modal with the given id
     */
    close: (id: T) => void;

    /**
     * Toggles modal with the given id
     */
    toggle: (id: T) => void;

    /**
     * Closes all modals within the stack
     */
    closeAll: () => void;

    /**
     * Returns props for modal with the given id
     * Compatible with Modal.Root from Mantine
     */
    register: (id: T) => {
        opened: boolean;
        onClose: () => void;
        stackId: T;
    };
}

/**
 * Custom hook to manage multiple Mantine modals with proper scroll locking
 * Works with Modal.Root from Mantine v8
 *
 * Key features:
 * - Tracks which modals are open
 * - Only locks body scroll when at least one modal is open
 * - Properly restores scroll when all modals are closed
 * - Designed to work with MantineModal component
 *
 * @param modalIds - Array of unique modal IDs
 * @returns Object with methods to control modals
 *
 * @example
 * ```tsx
 * const stack = useMantineModalStack(['list', 'create']);
 *
 * return (
 *   <>
 *     <MantineModal {...stack.register('list')} title="List">
 *       <Box>List Modal</Box>
 *     </MantineModal>
 *
 *     <MantineModal {...stack.register('create')} title="Create">
 *       <Box>Create Modal</Box>
 *     </MantineModal>
 *
 *     <Button onClick={() => stack.open('list')}>Open List</Button>
 *   </>
 * );
 * ```
 */
export function useMantineModalStack<T extends string>(
    modalIds: readonly T[],
): UseMantineModalStackReturnType<T> {
    // Track which modals are open
    const [state, setState] = useState<Record<T, boolean>>(() => {
        const initialState: Record<T, boolean> = {} as Record<T, boolean>;
        modalIds.forEach((id) => {
            initialState[id] = false;
        });
        return initialState;
    });

    // Track original inline overflow style to restore it properly
    const originalOverflowRef = useRef<string | null>(null);

    /**
     * Lock/unlock scroll based on modal states
     * Properly restores the original inline style (or removes it if there wasn't one)
     */
    useEffect(() => {
        const hasOpenModal = Object.values(state).some((isOpen) => isOpen);

        if (hasOpenModal) {
            // Lock scroll - save original value if not already saved
            if (originalOverflowRef.current === null) {
                // Get the current inline style value
                const currentOverflow = document.body.style.overflow;
                // Only save if it's a real value (not empty string) and not 'hidden'
                // If it's 'hidden', we probably set it, so treat as no original inline style
                if (currentOverflow && currentOverflow !== 'hidden') {
                    originalOverflowRef.current = currentOverflow;
                } else {
                    // No inline style or it's 'hidden' (which we set) - save null
                    originalOverflowRef.current = null;
                }
            }
            document.body.style.overflow = 'hidden';
        } else {
            // Unlock scroll - restore original behavior
            if (originalOverflowRef.current !== null) {
                // Restore the original inline style
                document.body.style.overflow = originalOverflowRef.current;
            } else {
                // No original inline style - remove the property
                document.body.style.removeProperty('overflow');
            }
            // Always reset the ref when unlocking
            originalOverflowRef.current = null;
        }

        // Cleanup on unmount
        return () => {
            if (originalOverflowRef.current !== null) {
                document.body.style.overflow = originalOverflowRef.current;
            } else {
                document.body.style.removeProperty('overflow');
            }
            originalOverflowRef.current = null;
        };
    }, [state]);

    /**
     * Open a modal
     */
    const open = useCallback((id: T) => {
        setState((prev) => {
            if (prev[id]) return prev; // Already open
            return { ...prev, [id]: true };
        });
    }, []);

    /**
     * Close a modal
     */
    const close = useCallback((id: T) => {
        setState((prev) => {
            if (!prev[id]) return prev; // Already closed
            return { ...prev, [id]: false };
        });
    }, []);

    /**
     * Toggle a modal
     */
    const toggle = useCallback((id: T) => {
        setState((prev) => {
            const isOpen = prev[id];
            return { ...prev, [id]: !isOpen };
        });
    }, []);

    /**
     * Close all modals
     */
    const closeAll = useCallback(() => {
        setState(() => {
            const newState: Record<T, boolean> = {} as Record<T, boolean>;
            modalIds.forEach((id) => {
                newState[id] = false;
            });
            return newState;
        });
    }, [modalIds]);

    /**
     * Register a modal - returns props compatible with Modal.Root
     */
    const register = useCallback(
        (id: T) => {
            return {
                opened: state[id] ?? false,
                onClose: () => close(id),
                stackId: id,
            };
        },
        [state, close],
    );

    return useMemo(
        () => ({
            state,
            open,
            close,
            toggle,
            closeAll,
            register,
        }),
        [state, open, close, toggle, closeAll, register],
    );
}
