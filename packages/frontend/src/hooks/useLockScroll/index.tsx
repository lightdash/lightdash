import { useEffect, type RefObject } from 'react';

/**
 * Locks the scroll of the element referenced by the ref object
 * @param ref - RefObject<HTMLElement>
 * @param isLocked - boolean
 */
export const useLockScroll = (
    ref: RefObject<HTMLElement>,
    isLocked: boolean = false,
) => {
    useEffect(() => {
        if (!isLocked || !ref.current) return;

        // Save initial style
        const element = ref.current;
        const originalStyle = window.getComputedStyle(element).overflow;

        // Prevent scrolling
        element.style.overflow = 'hidden';

        // Cleanup: restore original style
        return () => {
            if (element) {
                element.style.overflow = originalStyle;
            }
        };
    }, [isLocked, ref]);
};
