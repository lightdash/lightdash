import { useMantineTheme } from '@mantine/core';
import { useLayoutEffect, useRef, type RefObject } from 'react';

// The dashboard's tabs and filter bar, which stick under its header
const STICKY_BAR_SELECTOR = '[data-has-header-above]';
// Air between the stuck bar and the rail's header
const GAP = 8;

// Below `sm` the rail goes in the flow above the grid, which on a scrolled
// page is behind the stuck tabs and filter bar: scroll it to just under
// them. Closing puts the page back, unless it was scrolled meanwhile
export const useRailIntoView = (ref: RefObject<HTMLElement | null>) => {
    const theme = useMantineTheme();
    // Where the page was and where the rail put it; kept across a remount
    // in development, which runs the effect twice on one rail
    const scrolled = useRef<{ before: number; target: number } | null>(null);
    useLayoutEffect(() => {
        const rail = ref.current;
        const bar = document.querySelector<HTMLElement>(STICKY_BAR_SELECTOR);
        if (rail === null) return;
        if (
            scrolled.current === null &&
            bar !== null &&
            window.matchMedia(`(width < ${theme.breakpoints.sm})`).matches &&
            rail.getBoundingClientRect().top <
                bar.getBoundingClientRect().bottom
        ) {
            // Where the bar's bottom is once it sticks
            const stuckBottom =
                parseFloat(getComputedStyle(bar).top) + bar.offsetHeight;
            const target = Math.max(
                0,
                rail.getBoundingClientRect().top +
                    window.scrollY -
                    stuckBottom -
                    GAP,
            );
            scrolled.current = { before: window.scrollY, target };
            window.scrollTo({ top: target });
        }
        return () => {
            const current = scrolled.current;
            if (current === null) return;
            const wasScrolledSince =
                Math.abs(window.scrollY - current.target) > 1;
            // Once the rail has left the page, which moved what was under it
            requestAnimationFrame(() => {
                if (rail.isConnected) return;
                scrolled.current = null;
                if (!wasScrolledSince) window.scrollTo({ top: current.before });
            });
        };
    }, [ref, theme.breakpoints.sm]);
};
