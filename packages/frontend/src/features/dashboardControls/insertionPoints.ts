import { type ControlPlacement } from './sections';

export type BarRect = {
    left: number;
    right: number;
    top: number;
    bottom: number;
};

/** A control on a bar line as drawn; a section's members are those shown open */
export type BarItem = {
    id: string;
    rect: BarRect;
    section: {
        head: BarRect | null;
        /** Its trailing "+", "..." and, folded, its count */
        end: BarRect | null;
        members: { id: string; rect: BarRect }[];
    } | null;
};

export type BarLayout = {
    /** "Add filter", first on the first line */
    start: BarRect;
    /** In order; the first line's `lineStartId` is null */
    lines: { lineStartId: string | null; items: BarItem[] }[];
};

type Point = { x: number; row: BarRect; placement: ControlPlacement };

// Below the last line by more than this, a drop goes nowhere
const BELOW_LAST_LINE = 40;

const isWithin = (rect: BarRect, x: number, y: number) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

// Across the pointer's row first, then across rows
const distance = ({ x, row }: Point, px: number, py: number) =>
    Math.abs(x - px) + 4 * Math.max(0, row.top - py, py - row.bottom);

const nearest = (points: Point[], x: number, y: number) =>
    points.reduce<Point | null>(
        (best, point) =>
            best === null || distance(point, x, y) < distance(best, x, y)
                ? point
                : best,
        null,
    )?.placement ?? null;

// Before each control of a run and after its last; an empty run only after `start`
const pointsAround = (
    items: { id: string; rect: BarRect }[],
    empty: Point | null,
): Point[] => {
    const last = items.at(-1);
    if (last === undefined) return empty === null ? [] : [empty];
    return [
        ...items.map(({ id, rect }) => ({
            x: rect.left,
            row: rect,
            placement: { overId: id, side: 'before' as const },
        })),
        {
            x: last.rect.right,
            row: last.rect,
            placement: { overId: last.id, side: 'after' },
        },
    ];
};

/**
 * Where a pointer drag drops: the insertion point nearest the pointer, on
 * the bar line whose band holds it (between lines, or just below the last,
 * a line of its own). In a section's capsule, away from its head and
 * trailing actions, only its inside points count (never for a dragged
 * section); on its head, before it; on its actions, after it
 */
export const chooseInsertionPoint = (
    layout: BarLayout,
    pointer: { x: number; y: number },
    isSectionDrag: boolean,
): ControlPlacement | null => {
    const { x, y } = pointer;
    const bands = layout.lines.map(({ items }, index) => {
        const rects = [
            ...items.map(({ rect }) => rect),
            ...(index === 0 ? [layout.start] : []),
        ];
        return {
            top: Math.min(...rects.map(({ top }) => top)),
            bottom: Math.max(...rects.map(({ bottom }) => bottom)),
        };
    });
    const index = bands.findIndex(({ bottom }) => y <= bottom);
    if (index === -1)
        return y <= (bands.at(-1)?.bottom ?? 0) + BELOW_LAST_LINE
            ? { lineStartId: null }
            : null;
    const line = layout.lines[index];
    if (index > 0 && y < bands[index].top)
        return { lineStartId: line.lineStartId };
    const capsule = isSectionDrag
        ? undefined
        : line.items.find(
              ({ section, rect }) => section !== null && isWithin(rect, x, y),
          );
    if (capsule?.section) {
        const { head, end, members } = capsule.section;
        if (head !== null && isWithin(head, x, y))
            return { overId: capsule.id, side: 'before' };
        if (end !== null && isWithin(end, x, y))
            return { overId: capsule.id, side: 'after' };
        return nearest(
            pointsAround(members, {
                x: end?.left ?? capsule.rect.right,
                row: end ?? capsule.rect,
                placement: { sectionId: capsule.id },
            }),
            x,
            y,
        );
    }
    return nearest(
        pointsAround(
            line.items,
            index === 0
                ? {
                      x: layout.start.right,
                      row: layout.start,
                      placement: { barStart: true },
                  }
                : null,
        ),
        x,
        y,
    );
};
