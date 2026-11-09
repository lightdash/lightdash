import { DashboardControlRefKind } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    chooseInsertionPoint,
    type BarItem,
    type BarLayout,
    type BarRect,
} from './insertionPoints';
import { placeControl } from './sections';

const box = (left: number, right: number, top = 0, bottom = 28): BarRect => ({
    left,
    right,
    top,
    bottom,
});
const pill = (id: string, rect: BarRect): BarItem => ({
    id,
    rect,
    section: null,
});

// Line 1: Add, f1, an open section S (members m1, m2), f2
// Line 2: a folded section T, a folded section U, p1
const layout: BarLayout = {
    start: box(0, 60),
    lines: [
        {
            lineStartId: null,
            items: [
                pill('f1', box(70, 150)),
                {
                    id: 'S',
                    rect: box(160, 400, -4, 32),
                    section: {
                        head: box(163, 230),
                        end: box(360, 396),
                        members: [
                            { id: 'm1', rect: box(235, 290) },
                            { id: 'm2', rect: box(296, 350) },
                        ],
                    },
                },
                pill('f2', box(410, 480)),
            ],
        },
        {
            lineStartId: 'T',
            items: [
                {
                    id: 'T',
                    rect: box(0, 200, 44, 80),
                    section: {
                        head: box(3, 80, 48, 76),
                        end: box(120, 196, 48, 76),
                        members: [],
                    },
                },
                {
                    id: 'U',
                    rect: box(210, 300, 44, 80),
                    section: {
                        head: box(213, 250, 48, 76),
                        end: box(260, 296, 48, 76),
                        members: [],
                    },
                },
                pill('p1', box(310, 380, 48, 76)),
            ],
        },
    ],
};
const at = (x: number, y: number, isSectionDrag = false) =>
    chooseInsertionPoint(layout, { x, y }, isSectionDrag);

describe('chooseInsertionPoint', () => {
    it('lands between two controls on the nearest gap, whatever their kind', () => {
        expect(at(405, 14)).toEqual({ overId: 'f2', side: 'before' });
        expect(at(155, 14)).toEqual({ overId: 'S', side: 'before' });
        // Between two capsules
        expect(at(205, 60)).toEqual({ overId: 'U', side: 'before' });
        // Over "Add filter": first on the bar
        expect(at(30, 14)).toEqual({ overId: 'f1', side: 'before' });
    });

    it('lands before a capsule over its head, after it over its actions', () => {
        expect(at(200, 14)).toEqual({ overId: 'S', side: 'before' });
        expect(at(380, 14)).toEqual({ overId: 'S', side: 'after' });
        // A folded one has nothing to land between: past its head it joins
        expect(at(150, 60)).toEqual({ sectionId: 'T' });
    });

    it('lands inside a capsule only away from its head and actions', () => {
        expect(at(292, 14)).toEqual({ overId: 'm2', side: 'before' });
        expect(at(240, 14)).toEqual({ overId: 'm1', side: 'before' });
        expect(at(355, 14)).toEqual({ overId: 'm2', side: 'after' });
        // A folded one has one point inside: its end
        expect(at(100, 60)).toEqual({ sectionId: 'T' });
    });

    it('takes the nearest point on the row in empty space at a line end', () => {
        expect(at(550, 14)).toEqual({ overId: 'f2', side: 'after' });
        expect(at(600, 60)).toEqual({ overId: 'p1', side: 'after' });
    });

    it('starts a line between lines or just below the last, and nothing far below', () => {
        expect(at(300, 38)).toEqual({ lineStartId: 'T' });
        expect(at(100, 95)).toEqual({ lineStartId: null });
        expect(at(100, 200)).toBeNull();
        // Above the bar is its first line
        expect(at(30, -20)).toEqual({ overId: 'f1', side: 'before' });
    });

    it('gives a dragged section outside points only', () => {
        expect(at(292, 14, true)).toEqual({ overId: 'f2', side: 'before' });
        expect(at(100, 60, true)).toEqual({ overId: 'T', side: 'before' });
        expect(at(190, 60, true)).toEqual({ overId: 'U', side: 'before' });
    });

    it('lands after "Add filter" on a first line with nothing else', () => {
        expect(
            chooseInsertionPoint(
                {
                    start: box(0, 60),
                    lines: [{ lineStartId: null, items: [] }],
                },
                { x: 200, y: 14 },
                false,
            ),
        ).toEqual({ barStart: true });
    });

    it('is a no-op where the control already is', () => {
        const { FILTER, SECTION } = DashboardControlRefKind;
        const bar = [
            { kind: FILTER, id: 'f1', sectionId: null, newLine: false },
            { kind: SECTION, id: 'S', sectionId: null, newLine: false },
        ];
        const point = at(30, 14);
        expect(point).not.toBeNull();
        expect(placeControl(bar, 'f1', point!)).toBe(bar);
        expect(placeControl(bar, 'f1', at(200, 14)!)).toBe(bar);
    });
});

// Real sizes: 28px pills, a 6px gap, a capsule's 1px border and 3px padding
describe('chooseInsertionPoint at real sizes', () => {
    const one = (items: BarItem[], start = box(-100, -40)): BarLayout => ({
        start,
        lines: [{ lineStartId: null, items }],
    });

    it("lands after each wrapped row's last control, between rows after the upper one's", () => {
        // a and b on the first row of a 340px bar, c wrapped below
        const wrapped = one(
            [
                pill('a', box(70, 200)),
                pill('b', box(206, 330)),
                pill('c', box(0, 120, 36, 64)),
            ],
            box(0, 60),
        );
        const on = (x: number, y: number) =>
            chooseInsertionPoint(wrapped, { x, y }, false);
        expect(on(338, 14)).toEqual({ overId: 'b', side: 'after' });
        expect(on(300, 14)).toEqual({ overId: 'b', side: 'after' });
        expect(on(250, 14)).toEqual({ overId: 'b', side: 'before' });
        expect(on(150, 32)).toEqual({ overId: 'b', side: 'after' });
        expect(on(150, 50)).toEqual({ overId: 'c', side: 'after' });
    });

    it('lands between stacked capsules on a narrow bar, by row', () => {
        const section = (id: string, rect: BarRect): BarItem => ({
            id,
            rect,
            section: {
                head: box(
                    rect.left + 4,
                    rect.left + 60,
                    rect.top + 4,
                    rect.bottom - 4,
                ),
                end: box(
                    rect.right - 50,
                    rect.right - 4,
                    rect.top + 4,
                    rect.bottom - 4,
                ),
                members: [],
            },
        });
        const narrow: BarLayout = {
            start: box(0, 60),
            lines: [
                { lineStartId: null, items: [] },
                {
                    lineStartId: 'S1',
                    items: [
                        section('S1', box(0, 200, 40, 76)),
                        section('S2', box(0, 150, 92, 128)),
                        section('S3', box(0, 180, 144, 180)),
                    ],
                },
            ],
        };
        const on = (x: number, y: number) =>
            chooseInsertionPoint(narrow, { x, y }, true);
        expect(on(100, 80)).toEqual({ overId: 'S1', side: 'after' });
        expect(on(100, 86)).toEqual({ overId: 'S1', side: 'after' });
        expect(on(190, 58)).toEqual({ overId: 'S1', side: 'after' });
        expect(on(170, 110)).toEqual({ overId: 'S2', side: 'after' });
    });

    // Border 1 + padding 3; head 4-110, gap 6, count 116-140, gap 6, actions 146-196
    const folded = one([
        {
            id: 'T',
            rect: box(0, 201, -4, 32),
            section: { head: box(4, 110), end: box(116, 196), members: [] },
        },
    ]);
    const onFolded = (x: number, y: number) =>
        chooseInsertionPoint(folded, { x, y }, false);

    it('joins a folded or empty section anywhere past its head; after it is the gap outside', () => {
        for (const x of [113, 130, 170, 199])
            expect(onFolded(x, 14)).toEqual({ sectionId: 'T' });
        expect(onFolded(60, 14)).toEqual({ overId: 'T', side: 'before' });
        expect(onFolded(204, 14)).toEqual({ overId: 'T', side: 'after' });
    });

    it("counts the frame left of and above the head as the head, so entering doesn't flicker", () => {
        expect(onFolded(2, 14)).toEqual({ overId: 'T', side: 'before' });
        expect(onFolded(60, -2)).toEqual({ overId: 'T', side: 'before' });
        const open = one([
            {
                id: 'S',
                rect: box(0, 300, -4, 32),
                section: {
                    head: box(4, 110),
                    end: box(250, 296),
                    members: [
                        { id: 'm1', rect: box(116, 180) },
                        { id: 'm2', rect: box(186, 244) },
                    ],
                },
            },
        ]);
        for (const x of [-3, 2, 60])
            expect(chooseInsertionPoint(open, { x, y: 14 }, false)).toEqual({
                overId: 'S',
                side: 'before',
            });
        expect(chooseInsertionPoint(open, { x: 118, y: 14 }, false)).toEqual({
            overId: 'm1',
            side: 'before',
        });
    });
});
