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

// A spot on a row: what lands before it (none for "Add filter") and after it
type Slot = {
    rect: BarRect;
    before: ControlPlacement | null;
    after: ControlPlacement;
};
type Point = { x: number; placement: ControlPlacement };

// Below the last line by more than this, a drop goes nowhere
const BELOW_LAST_LINE = 40;
// Controls whose tops differ by less share a row (a capsule overhangs by 4px)
const ROW_TOLERANCE = 8;
// Half the gap below a capsule's head, which still counts as the head
const UNDER_HEAD = 4;

const isWithin = (rect: BarRect, x: number, y: number) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

const slotOf = ({ id, rect }: { id: string; rect: BarRect }): Slot => ({
    rect,
    before: { overId: id, side: 'before' },
    after: { overId: id, side: 'after' },
});

// A wrapped run's rows, in order: each slot joins the row above unless it starts lower
const rowsOf = (slots: Slot[]) =>
    slots
        .reduce<Slot[][]>((rows, slot) => {
            const row = rows.at(-1);
            if (
                row !== undefined &&
                slot.rect.top - row[0].rect.top < ROW_TOLERANCE
            )
                row.push(slot);
            else rows.push([slot]);
            return rows;
        }, [])
        .map((row) => ({
            row,
            top: Math.min(...row.map(({ rect }) => rect.top)),
            bottom: Math.max(...row.map(({ rect }) => rect.bottom)),
        }));

const afterLast = (row: Slot[]): Point => {
    const last = row[row.length - 1];
    return { x: last.rect.right, placement: last.after };
};

// On the pointer's row: before each slot and after the row's last. Between
// two rows (a wrapped or stacked run): the upper row's end or the lower's start
const pointsAt = (slots: Slot[], y: number): Point[] => {
    const rows = rowsOf(slots);
    const upper = rows.filter(({ bottom }) => bottom < y).at(-1);
    const lower = rows.find(({ top }) => top > y);
    const onRow = rows.find(({ top, bottom }) => y >= top && y <= bottom);
    if (onRow === undefined && upper !== undefined && lower !== undefined) {
        const [first] = lower.row;
        return [
            afterLast(upper.row),
            ...(first.before === null
                ? []
                : [{ x: first.rect.left, placement: first.before }]),
        ];
    }
    const row = onRow ?? upper ?? lower;
    if (row === undefined) return [];
    return [
        ...row.row.flatMap(({ rect, before }) =>
            before === null ? [] : [{ x: rect.left, placement: before }],
        ),
        afterLast(row.row),
    ];
};

const nearest = (points: Point[], x: number) =>
    points.reduce<Point | null>(
        (best, point) =>
            best === null || Math.abs(point.x - x) < Math.abs(best.x - x)
                ? point
                : best,
        null,
    )?.placement ?? null;

/**
 * Where a pointer drag drops: on the bar line whose band holds the pointer
 * (between lines, or just below the last, a line of its own), the point
 * nearest it on its visual row ("Add filter" is the first line's first
 * slot). In a section's capsule (never for a dragged section): on its head
 * and the frame around it, before it; with nothing shown in it, anywhere
 * else joins it; else from its trailing actions rightwards on their row,
 * after it, and elsewhere its members' points
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
        // The frame left of and above the head, and just under it, is the head
        if (head !== null && x <= head.right && y <= head.bottom + UNDER_HEAD)
            return { overId: capsule.id, side: 'before' };
        // Nothing shown in it (folded or empty): the rest of it joins it
        if (members.length === 0) return { sectionId: capsule.id };
        // On the actions' row, from them rightwards, after it
        if (end !== null && x >= end.left && y >= end.top && y <= end.bottom)
            return { overId: capsule.id, side: 'after' };
        return nearest(pointsAt(members.map(slotOf), y), x);
    }
    return nearest(
        pointsAt(
            [
                ...(index === 0
                    ? [
                          {
                              rect: layout.start,
                              before: null,
                              after: { barStart: true as const },
                          },
                      ]
                    : []),
                ...line.items.map(slotOf),
            ],
            y,
        ),
        x,
    );
};
