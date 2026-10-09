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

// When a row is clicked, the first tile on its field scrolls into view if none
// of them is visible. Hover never scrolls, and neither do the marks tiles carry
// while no row is clicked: the list passes the clicked field only then, and
// only to the tiles on it. A field on no tile scrolls nothing.
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
