type Position = { x: number; y: number };
type Size = { width: number; height: number };

const NEAR_PX = 24;
const MARGIN_PX = 16;
const GAP_PX = 32;

const isNear = (a: DOMRect, b: DOMRect): boolean =>
    a.left <= b.right + NEAR_PX &&
    a.right >= b.left - NEAR_PX &&
    a.top <= b.bottom + NEAR_PX &&
    a.bottom >= b.top - NEAR_PX;

const clampTo = (at: Position, size: Size, viewport: DOMRect): Position => {
    const minX = viewport.left + MARGIN_PX;
    const minY = viewport.top + MARGIN_PX;
    return {
        x: Math.max(
            minX,
            Math.min(at.x, viewport.right - MARGIN_PX - size.width),
        ),
        y: Math.max(
            minY,
            Math.min(at.y, viewport.bottom - MARGIN_PX - size.height),
        ),
    };
};

// A bubble taller than the viewport counts while its top is in view.
const inView = (rect: DOMRect, viewport: DOMRect): boolean =>
    rect.left >= viewport.left &&
    rect.right <= viewport.right &&
    rect.top >= viewport.top &&
    (rect.bottom <= viewport.bottom || rect.height > viewport.height);

/** The nearest place in view for a bubble, or where it is when it is in view. */
export const intoView = (current: DOMRect, viewport: DOMRect): Position =>
    inView(current, viewport)
        ? { x: current.left, y: current.top }
        : clampTo({ x: current.left, y: current.top }, current, viewport);

/** Where a bubble's top left goes, in viewport pixels. */
export const placeBubble = ({
    markRect,
    current,
    size,
    viewport,
    pointer,
}: {
    markRect: DOMRect | null;
    current: DOMRect | null;
    size: Size;
    viewport: DOMRect;
    pointer: Position;
}): Position => {
    if (!markRect) {
        return current
            ? { x: current.left, y: current.top }
            : clampTo({ x: pointer.x + GAP_PX, y: pointer.y }, size, viewport);
    }
    // Scrolled out of view, it comes back beside the new mark.
    if (current && !isNear(current, markRect) && inView(current, viewport)) {
        return { x: current.left, y: current.top };
    }
    const left = { x: markRect.left - GAP_PX - size.width, y: markRect.top };
    const right = { x: markRect.right + GAP_PX, y: markRect.top };
    const above = { x: markRect.left, y: markRect.top - GAP_PX - size.height };
    const below = { x: markRect.left, y: markRect.bottom + GAP_PX };
    const pointerOnRight = pointer.x >= markRect.left + markRect.width / 2;
    const pointerBelow = pointer.y >= markRect.top + markRect.height / 2;
    // Away from the pointer first, then wherever the viewport leaves room.
    const sides = [
        ...(pointerOnRight ? [left, right] : [right, left]),
        ...(pointerBelow ? [above, below] : [below, above]),
    ].map((side) => clampTo(side, size, viewport));
    const clear = sides.find(
        (side) =>
            !isNear(
                new DOMRect(side.x, side.y, size.width, size.height),
                markRect,
            ),
    );
    return clear ?? sides[0];
};
