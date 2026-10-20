import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

type Size = { width: number; height: number };

const RESIZE_SETTLE_MS = 150;
// Smaller changes are layout jitter, such as a scrollbar appearing
const MIN_CHANGE_PX = 4;

const readSize = (element: HTMLElement | null): Size | null => {
    const rect = element?.getBoundingClientRect();
    const width = Math.round(rect?.width ?? 0);
    const height = Math.round(rect?.height ?? 0);
    return width > 0 && height > 0 ? { width, height } : null;
};

// Measured before paint on mount and whenever `layoutKey` changes, which the caller changes with anything that resizes
// the box, such as the strip, so nothing is painted at a stale size; `isMeasured` says the size is for the current key
export const useContainerSize = (
    fallback: Size,
    layoutKey: string,
): Size & { ref: RefObject<HTMLDivElement | null>; isMeasured: boolean } => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [measured, setMeasured] = useState<Size & { key: string | null }>({
        ...fallback,
        key: null,
    });

    useLayoutEffect(() => {
        const size = readSize(ref.current);
        // Where nothing can be measured the size so far, at first the fallback, stands for the new key
        setMeasured((previous) => ({ ...(size ?? previous), key: layoutKey }));
    }, [layoutKey]);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Wait for a resize to settle, so a drag of the window edge redraws once
        const observer = new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const size = readSize(element);
                if (size === null) return;
                setMeasured((previous) =>
                    Math.abs(previous.width - size.width) <= MIN_CHANGE_PX &&
                    Math.abs(previous.height - size.height) <= MIN_CHANGE_PX
                        ? previous
                        : { ...size, key: previous.key },
                );
            }, RESIZE_SETTLE_MS);
        });
        observer.observe(element);
        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, []);

    return {
        ref,
        width: measured.width,
        height: measured.height,
        isMeasured: measured.key === layoutKey,
    };
};
