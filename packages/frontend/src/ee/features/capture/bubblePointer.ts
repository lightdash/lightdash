type Position = { x: number; y: number };

/** On the row a bubble is dragged by. */
export const BUBBLE_DRAG_ATTRIBUTE = 'data-bubble-drag-handle';

const CONTROLS =
    'button, a, input, textarea, select, [role="button"], [contenteditable="true"]';
// What stays on screen, so a dragged bubble can always be grabbed again.
const KEEP_WIDTH_PX = 80;
const KEEP_HEIGHT_PX = 40;

/** A press here drags the bubble: on its header, not on a control in it. */
export const dragStartsOn = (target: Element, bubble: Element): boolean => {
    const handle = target.closest(`[${BUBBLE_DRAG_ATTRIBUTE}]`);
    return (
        handle !== null &&
        bubble.contains(handle) &&
        !handle.contains(target.closest(CONTROLS))
    );
};

/**
 * Where a dragged bubble may be dropped: its header stays within reach. `whole`
 * keeps all of its width in view, for a bubble that would widen the page.
 */
export const clampDrag = (
    at: Position,
    size: { width: number; height: number },
    viewport: DOMRect,
    whole: boolean,
): Position => ({
    x: Math.max(
        whole ? viewport.left : viewport.left + KEEP_WIDTH_PX - size.width,
        Math.min(
            at.x,
            whole
                ? viewport.right - size.width
                : viewport.right - KEEP_WIDTH_PX,
        ),
    ),
    y: Math.max(viewport.top, Math.min(at.y, viewport.bottom - KEEP_HEIGHT_PX)),
});

const scrolls = (overflow: string) =>
    overflow === 'auto' || overflow === 'scroll';

/**
 * Something between the wheel's target and the bubble can scroll that way. When
 * nothing can, the wheel would scroll the page under the bubble.
 */
export const wheelScrollsInside = (
    target: Element,
    bubble: Element,
    delta: Position,
): boolean => {
    for (
        let el: Element | null = target;
        el && bubble.contains(el);
        el = el.parentElement
    ) {
        const style = window.getComputedStyle(el);
        const roomY = el.scrollHeight - el.clientHeight;
        const roomX = el.scrollWidth - el.clientWidth;
        if (
            delta.y !== 0 &&
            scrolls(style.overflowY) &&
            (delta.y < 0 ? el.scrollTop > 0 : el.scrollTop < roomY - 1)
        ) {
            return true;
        }
        if (
            delta.x !== 0 &&
            scrolls(style.overflowX) &&
            (delta.x < 0 ? el.scrollLeft > 0 : el.scrollLeft < roomX - 1)
        ) {
            return true;
        }
    }
    return false;
};
