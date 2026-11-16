import { useLayoutEffect, useState } from 'react';

// Smaller changes are layout jitter, such as a scrollbar appearing
const MIN_CHANGE_PX = 4;

// How tall a box may be for the whole page to fit the window without scrolling: the window's height less everything
// above the box and everything below it, up to the end of the page marked `data-ad-page`. Null until measured.
export const useFitHeight = (): { ref: (element: HTMLDivElement | null) => void; height: number | null } => {
    const [element, setElement] = useState<HTMLDivElement | null>(null);
    const [height, setHeight] = useState<number | null>(null);
    useLayoutEffect(() => {
        const page = element?.closest<HTMLElement>('[data-ad-page]');
        if (!element || !page) {
            setHeight(null);
            return undefined;
        }
        const measure = () => {
            const box = element.getBoundingClientRect();
            const below = page.getBoundingClientRect().bottom - box.bottom;
            const next = Math.round(window.innerHeight - (box.top + window.scrollY) - below);
            setHeight((previous) => (previous !== null && Math.abs(previous - next) <= MIN_CHANGE_PX ? previous : next));
        };
        measure();
        window.addEventListener('resize', measure);
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(page);
        return () => {
            window.removeEventListener('resize', measure);
            observer?.disconnect();
        };
    }, [element]);
    return { ref: setElement, height };
};
