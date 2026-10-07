import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

type Size = { width: number; height: number };

// Measured before paint so the drawing never renders at a guessed size on screen.
// The fallback only applies where nothing can be measured.
export const useContainerSize = (
    fallback: Size,
): Size & { ref: RefObject<HTMLDivElement | null> } => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState<Size>(fallback);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return undefined;
        const measure = () => {
            const rect = element.getBoundingClientRect();
            const width = Math.round(rect.width);
            const height = Math.round(rect.height);
            if (width <= 0 || height <= 0) return;
            setSize((previous) =>
                previous.width === width && previous.height === height
                    ? previous
                    : { width, height },
            );
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return { ref, ...size };
};
