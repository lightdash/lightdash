import { useEffect, useState, type RefObject } from 'react';

/**
 * Viewport height left for the grid below everything above it, minus
 * `bottomPadding`. Null until measured or while disabled.
 */
export const useAvailableGridHeight = (
    ref: RefObject<HTMLElement | null>,
    enabled: boolean,
    bottomPadding: number,
): number | null => {
    const [availableHeight, setAvailableHeight] = useState<number | null>(null);

    useEffect(() => {
        const element = ref.current;
        if (!enabled || !element) {
            setAvailableHeight(null);
            return;
        }

        const measure = () => {
            // Document-relative, so page scroll doesn't change the result
            const top =
                element.getBoundingClientRect().top -
                document.documentElement.getBoundingClientRect().top;
            const next = Math.floor(window.innerHeight - top - bottomPadding);
            setAvailableHeight((prev) => (prev === next ? prev : next));
        };

        measure();
        // Header, filter bar and banners above the grid change the body size
        const observer = new ResizeObserver(measure);
        observer.observe(document.body);
        window.addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [ref, enabled, bottomPadding]);

    return availableHeight;
};
