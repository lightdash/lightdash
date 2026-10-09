import { useEffect, type RefObject } from 'react';

// While a field is clicked, the mapped tiles are the ones on that field
const HIGHLIGHTED_OVERLAY = "[data-tile-uuid] [data-highlighted='mapped']";

// At least half of the tile is on screen
const isInViewport = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();
    const visible =
        Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    return rect.height > 0 && visible / rect.height >= 0.5;
};

// A clicked row scrolls the first tile on its field into view when none is
// visible. Hover never does: the list passes the clicked field, not the active
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
