import { useEffect, type RefObject } from 'react';

// The dashboard's tabs and filter bar, which stick under its header; the rail
// sits under them, so their height moves it
const STICKY_BAR_SELECTOR = '[data-has-header-above][data-is-stuck]';
const VAR = '--controls-rail-offset';

// Where the rail sits in the page before it sticks: measured unstuck, so a
// page that is already scrolled gives the same answer
export const getRailTop = (rail: HTMLElement): number => {
    const { position } = rail.style;
    rail.style.position = 'static';
    const top = rail.getBoundingClientRect().top + window.scrollY;
    rail.style.position = position;
    return top;
};

// The rail is pinned where it naturally sits, under the stuck bar, and its
// max-height is taken from the same offset, so it always fits the viewport
export const useRailTop = (ref: RefObject<HTMLElement | null>) => {
    useEffect(() => {
        const rail = ref.current;
        if (rail === null) return;
        const update = () =>
            rail.style.setProperty(VAR, `${getRailTop(rail)}px`);
        update();
        const observer = new ResizeObserver(update);
        const bar = document.querySelector<HTMLElement>(STICKY_BAR_SELECTOR);
        if (bar !== null) observer.observe(bar);
        window.addEventListener('resize', update);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [ref]);
};
