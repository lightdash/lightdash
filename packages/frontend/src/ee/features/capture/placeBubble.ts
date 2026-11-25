type Position = { x: number; y: number };
type Size = { width: number; height: number };

const MARGIN_PX = 16;
const GAP_PX = 12;
/** A bubble this close to its marks still reads as theirs. */
export const ATTACHED_PX = 48;

const clampTo = (at: Position, size: Size, bounds: DOMRect): Position => ({
    x: Math.max(
        bounds.left + MARGIN_PX,
        Math.min(at.x, bounds.right - MARGIN_PX - size.width),
    ),
    y: Math.max(
        bounds.top + MARGIN_PX,
        Math.min(at.y, bounds.bottom - MARGIN_PX - size.height),
    ),
});

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

const overlapArea = (a: DOMRect, b: DOMRect): number =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

const covered = (rect: DOMRect, others: DOMRect[]): number =>
    others.reduce((sum, other) => sum + overlapArea(rect, other), 0);

const gapBetween = (a: DOMRect, b: DOMRect): number =>
    Math.max(
        0,
        a.left - b.right,
        b.left - a.right,
        a.top - b.bottom,
        b.top - a.bottom,
    );

const boundsOf = (rects: DOMRect[]): DOMRect => {
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    return new DOMRect(
        left,
        top,
        Math.max(...rects.map((r) => r.right)) - left,
        Math.max(...rects.map((r) => r.bottom)) - top,
    );
};

// Right, left, below, above.
const sidesOf = (rect: DOMRect, size: Size): Position[] => [
    { x: rect.right + GAP_PX, y: rect.top },
    { x: rect.left - GAP_PX - size.width, y: rect.top },
    { x: rect.left, y: rect.bottom + GAP_PX },
    { x: rect.left, y: rect.top - GAP_PX - size.height },
];

/**
 * Where a bubble's top left goes so it sits beside its own marks: where it is
 * while that is still beside them, else right, left, below or above all of
 * them, else beside the newest. A side that is off its marks and off `avoid`
 * wins; with none free it goes past what is in the way, in view or not.
 */
export const besideMarks = ({
    marks,
    current,
    size,
    bounds,
    avoid,
    reach,
}: {
    /** The bubble's marks, oldest first. */
    marks: DOMRect[];
    current: Position | null;
    size: Size;
    /** The room it may use: the viewport, or the whole page once sent. */
    bounds: DOMRect;
    /** Other bubbles and the toolbar. */
    avoid: DOMRect[];
    /** How far from its marks a bubble may be and stay where it is. */
    reach: number;
}): Position => {
    if (marks.length === 0) {
        return current ?? clampTo(bounds, size, bounds);
    }
    const all = boundsOf(marks);
    const rectAt = (at: Position) =>
        new DOMRect(at.x, at.y, size.width, size.height);
    const stays =
        current !== null &&
        clampTo(current, size, bounds).x === current.x &&
        clampTo(current, size, bounds).y === current.y &&
        gapBetween(rectAt(current), all) <= reach;
    const places = [
        ...(stays && current ? [current] : []),
        ...[
            ...sidesOf(all, size),
            ...sidesOf(marks[marks.length - 1], size),
        ].map((side) => clampTo(side, size, bounds)),
    ].map((at) => ({
        at,
        onMarks: covered(rectAt(at), marks),
        onOthers: covered(rectAt(at), avoid),
    }));
    const offMarks = places.filter((place) => place.onMarks === 0);
    // Every side is taken: go past what is in the way, even out of view.
    if (!places.some((p) => p.onMarks === 0 && p.onOthers === 0)) {
        const past = places
            .flatMap((place) =>
                avoid
                    .filter((other) => overlapArea(rectAt(place.at), other) > 0)
                    .flatMap((other) => [
                        { x: other.right + GAP_PX, y: place.at.y },
                        { x: place.at.x, y: other.bottom + GAP_PX },
                        { x: other.left - GAP_PX - size.width, y: place.at.y },
                        { x: place.at.x, y: other.top - GAP_PX - size.height },
                    ]),
            )
            .filter(
                (at) =>
                    at.x >= MARGIN_PX &&
                    at.y >= MARGIN_PX &&
                    covered(rectAt(at), marks) === 0 &&
                    covered(rectAt(at), avoid) === 0,
            );
        if (past.length > 0) {
            return past.reduce((best, at) =>
                gapBetween(rectAt(at), all) < gapBetween(rectAt(best), all)
                    ? at
                    : best,
            );
        }
    }
    // The first that covers least: of the others when one is off its marks.
    return (offMarks.length > 0 ? offMarks : places).reduce((best, place) =>
        (
            offMarks.length > 0
                ? place.onOthers < best.onOthers
                : place.onMarks < best.onMarks
        )
            ? place
            : best,
    ).at;
};

/**
 * How far to move a bubble so its top edge stays inside a surface that
 * scrolls on its own: scrolled past, it waits at the surface's edge.
 */
export const keepInRegion = (at: Position, region: DOMRect): Position => {
    const top = Math.min(
        Math.max(at.y, region.top + MARGIN_PX),
        Math.max(region.top + MARGIN_PX, region.bottom - ATTACHED_PX),
    );
    return { x: 0, y: top - at.y };
};
