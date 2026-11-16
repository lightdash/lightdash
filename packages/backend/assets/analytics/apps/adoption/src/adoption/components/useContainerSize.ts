import { useLayoutEffect, useState } from 'react';

type Size = { width: number; height: number };
// A size is only good for the box it was measured on
type Measured = Size & { element: HTMLDivElement };
const RESIZE_SETTLE_MS = 150;
// Smaller changes are layout jitter, such as a scrollbar appearing
const MIN_CHANGE_PX = 4;

const readSize = (element: HTMLElement | null): Size | null => {
    const rect = element?.getBoundingClientRect();
    const width = Math.round(rect?.width ?? 0);
    const height = Math.round(rect?.height ?? 0);
    return width > 0 && height > 0 ? { width, height } : null;
};

// The size of a box, measured before paint and again once a resize settles
// The ref is a callback, so a box that is mounted again (the view around it changed) is measured and watched afresh.
// Until the new box has been measured nothing is reported, so what is drawn in it never gets the old box's size.
export const useContainerSize = (): Size & { ref: (element: HTMLDivElement | null) => void; isMeasured: boolean } => {
    const [element, setElement] = useState<HTMLDivElement | null>(null);
    const [measured, setMeasured] = useState<Measured | null>(null);
    useLayoutEffect(() => {
        const first = readSize(element);
        setMeasured(element && first ? { ...first, element } : null);
        if (!element || typeof ResizeObserver === 'undefined') return undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const observer = new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const next = readSize(element);
                if (next === null) return;
                setMeasured((previous) =>
                    previous !== null &&
                    previous.element === element &&
                    Math.abs(previous.width - next.width) <= MIN_CHANGE_PX &&
                    Math.abs(previous.height - next.height) <= MIN_CHANGE_PX
                        ? previous
                        : { ...next, element },
                );
            }, RESIZE_SETTLE_MS);
        });
        observer.observe(element);
        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [element]);
    const size = measured !== null && measured.element === element ? measured : null;
    return { ref: setElement, width: size?.width ?? 0, height: size?.height ?? 0, isMeasured: size !== null };
};
