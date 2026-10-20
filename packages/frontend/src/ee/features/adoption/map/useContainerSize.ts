import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

type Size = { width: number; height: number };

const RESIZE_SETTLE_MS = 150;
// Smaller changes are layout jitter, such as a scrollbar appearing
const MIN_CHANGE_PX = 4;

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
        let isFirst = true;
        const measure = () => {
            const rect = element.getBoundingClientRect();
            const width = Math.round(rect.width);
            const height = Math.round(rect.height);
            if (width <= 0 || height <= 0) return;
            const tolerance = isFirst ? 0 : MIN_CHANGE_PX;
            isFirst = false;
            setSize((previous) =>
                Math.abs(previous.width - width) <= tolerance &&
                Math.abs(previous.height - height) <= tolerance
                    ? previous
                    : { width, height },
            );
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Wait for a resize to settle, so a drag of the window edge redraws once
        const observer = new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(measure, RESIZE_SETTLE_MS);
        });
        observer.observe(element);
        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, []);

    return { ref, ...size };
};
