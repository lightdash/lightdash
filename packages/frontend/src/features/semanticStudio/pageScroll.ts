/**
 * The browse pane scrolls as one page: its header, summary and lists move
 * together. Long lists stay virtualised against that page scroll, offset by
 * where they start on it. Outside the pane, a list scrolls on its own.
 */
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    createContext,
    useContext,
    useLayoutEffect,
    useState,
    type RefObject,
} from 'react';

export const PageScrollContext = createContext<HTMLElement | null>(null);

/** The page's scroll element, or null where a list scrolls on its own. */
const usePageScroll = () => useContext(PageScrollContext);

export const usePageVirtualizer = <T extends HTMLElement>(
    listRef: RefObject<T | null>,
    options: {
        count: number;
        estimateSize: (index: number) => number;
        overscan: number;
    },
) => {
    const page = usePageScroll();
    const [scrollMargin, setScrollMargin] = useState(0);
    useLayoutEffect(() => {
        const list = listRef.current;
        if (!page || !list) return undefined;
        const measure = () =>
            setScrollMargin(
                list.getBoundingClientRect().top -
                    page.getBoundingClientRect().top +
                    page.scrollTop,
            );
        measure();
        // Whatever sits above the list (a summary loading, a banner) moves it.
        const observer = new ResizeObserver(measure);
        Array.from(page.children).forEach((child) => observer.observe(child));
        return () => observer.disconnect();
    }, [page, listRef]);
    return useVirtualizer({
        ...options,
        getScrollElement: () => page ?? listRef.current,
        scrollMargin: page ? scrollMargin : 0,
    });
};
