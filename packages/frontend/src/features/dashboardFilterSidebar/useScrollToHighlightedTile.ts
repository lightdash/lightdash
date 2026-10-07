import { useEffect, type RefObject } from 'react';

const HIGHLIGHTED_OVERLAY = '[data-tile-uuid] [data-highlighted]';

const isInViewport = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
};

// When a row is clicked, the first highlighted chart scrolls into view if
// none of them is visible. Hover never scrolls.
export const useScrollToHighlightedTile = (
    ref: RefObject<HTMLElement | null>,
    highlightedFieldId: string | null,
    isHighlighted: boolean,
) => {
    useEffect(() => {
        const element = ref.current;
        if (highlightedFieldId === null || !isHighlighted || !element) return;
        const highlighted = [...document.querySelectorAll(HIGHLIGHTED_OVERLAY)];
        if (highlighted[0] !== element) return;
        if (highlighted.some(isInViewport)) return;
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [ref, highlightedFieldId, isHighlighted]);
};
