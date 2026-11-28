/**
 * Finds what the picture can leave out: the contents of a box that is out of
 * view and out of the page's flow, like a dashboard tile scrolled past. The
 * box itself stays, so nothing in view moves.
 */
export const offPageFinder = (
    inView: (element: Element) => boolean,
): ((element: Element) => boolean) => {
    const emptied = new Map<Element, boolean>();
    const isEmptied = (box: Element): boolean => {
        const known = emptied.get(box);
        if (known !== undefined) return known;
        const rect = box.getBoundingClientRect();
        const position = getComputedStyle(box).position;
        const result =
            (rect.width > 0 || rect.height > 0) &&
            !inView(box) &&
            (position === 'absolute' || position === 'fixed');
        emptied.set(box, result);
        return result;
    };
    return (element) => {
        const parent = element.parentElement;
        if (!parent || !isEmptied(parent)) return false;
        // Something of its own in view, like a menu, is still drawn.
        return !inView(element);
    };
};
