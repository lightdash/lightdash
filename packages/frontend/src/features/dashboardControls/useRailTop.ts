import { useEffect, type RefObject } from 'react';

// The dashboard's tabs and filter bar, which stick under its header
const STICKY_BAR_SELECTOR = '[data-has-header-above][data-is-stuck]';
const VAR = '--controls-rail-top';

// Where the bar ends once stuck: its own sticky top (header, banner) plus its
// height, which changes as the bar wraps
export const getRailTop = (bar: HTMLElement): number =>
    (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight;

// The rail sticks right under the bar, so the bar never covers it
export const useRailTop = (ref: RefObject<HTMLElement | null>) => {
    useEffect(() => {
        const rail = ref.current;
        const bar = document.querySelector<HTMLElement>(STICKY_BAR_SELECTOR);
        if (rail === null || bar === null) return;
        const update = () =>
            rail.style.setProperty(VAR, `${getRailTop(bar)}px`);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(bar);
        return () => observer.disconnect();
    }, [ref]);
};
