import { DashboardControlRefKind } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { placeControl } from './controlOrder';
import {
    chooseInsertionPoint,
    type BarItem,
    type BarLayout,
    type BarRect,
} from './insertionPoints';

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
        // Between rows: the nearer of the upper row's end and the lower's start
        expect(on(150, 32)).toEqual({ overId: 'c', side: 'before' });
        expect(on(300, 32)).toEqual({ overId: 'b', side: 'after' });
        expect(on(150, 50)).toEqual({ overId: 'c', side: 'after' });
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

// The reviewer's layouts, at real sizes
describe('chooseInsertionPoint on real layouts', () => {
    const P = (id: string, rect: BarRect): BarItem => pill(id, rect);
    const folded = (id: string, rect: BarRect): BarItem => ({
        id,
        rect,
        section: {
            head: box(
                rect.left + 4,
                rect.left + 90,
                rect.top + 4,
                rect.bottom - 4,
            ),
            end: box(
                rect.right - 60,
                rect.right - 4,
                rect.top + 4,
                rect.bottom - 4,
            ),
            members: [],
        },
    });
    // A 700px bar: five pills, then p6 and an open section S wrapping its
    // members on two rows, then p7; a second line of a folded F and an empty E
    const S: BarItem = {
        id: 'S',
        rect: box(116, 600, 40, 112),
        section: {
            head: box(120, 200, 44, 72),
            end: box(236, 290, 80, 108),
            members: [
                { id: 'm1', rect: box(206, 316, 44, 72) },
                { id: 'm2', rect: box(322, 432, 44, 72) },
                { id: 'm3', rect: box(438, 548, 44, 72) },
                { id: 'm4', rect: box(120, 230, 80, 108) },
            ],
        },
    };
    const wide: BarLayout = {
        start: box(0, 80),
        lines: [
            {
                lineStartId: null,
                items: [
                    P('p1', box(86, 196)),
                    P('p2', box(202, 312)),
                    P('p3', box(318, 428)),
                    P('p4', box(434, 544)),
                    P('p5', box(550, 660)),
                    P('p6', box(0, 110, 44, 72)),
                    S,
                    P('p7', box(0, 110, 124, 152)),
                ],
            },
            {
                lineStartId: 'F',
                items: [
                    {
                        id: 'F',
                        rect: box(0, 201, 164, 200),
                        section: {
                            head: box(4, 110, 168, 196),
                            end: box(116, 196, 168, 196),
                            members: [],
                        },
                    },
                    {
                        id: 'E',
                        rect: box(207, 400, 164, 200),
                        section: {
                            head: box(211, 300, 168, 196),
                            end: box(306, 396, 168, 196),
                            members: [],
                        },
                    },
                ],
            },
        ],
    };
    const on = (layout: BarLayout, x: number, y: number, isSection = false) =>
        chooseInsertionPoint(layout, { x, y }, isSection);
    const before = (id: string) => ({ overId: id, side: 'before' });
    const after = (id: string) => ({ overId: id, side: 'after' });

    it('takes the nearer end between wrapped rows, so the line stays by the pointer', () => {
        expect(on(wide, 690, 14)).toEqual(after('p5'));
        expect(on(wide, 10, 34)).toEqual(before('p6'));
        expect(on(wide, 650, 34)).toEqual(after('p5'));
        expect(on(wide, 20, 116)).toEqual(before('p7'));
        expect(on(wide, 650, 60)).toEqual(after('S'));
    });

    it('lands after a wrapped section from its actions rightwards on their row', () => {
        expect(on(wide, 233, 94)).toEqual(after('m4'));
        for (const x of [260, 300, 590])
            expect(on(wide, x, 94)).toEqual(after('S'));
        expect(on(wide, 300, 76)).toEqual(before('m4'));
    });

    it('counts the frame around the head, and just under it, as the head', () => {
        expect(on(wide, 117, 42)).toEqual(before('S'));
        expect(on(wide, 150, 74)).toEqual(before('S'));
        expect(on(wide, 118, 94)).toEqual(before('m4'));
    });

    it('joins folded and empty sections past their head, after them outside', () => {
        expect(on(wide, 60, 182)).toEqual(before('F'));
        for (const x of [112, 150, 190, 200])
            expect(on(wide, x, 182)).toEqual({ sectionId: 'F' });
        expect(on(wide, 204, 182)).toEqual(before('E'));
        expect(on(wide, 350, 182)).toEqual({ sectionId: 'E' });
        expect(on(wide, 500, 182)).toEqual(after('E'));
    });

    it('starts lines between lines and below the last, and nothing far below', () => {
        expect(on(wide, 50, 158)).toEqual({ lineStartId: 'F' });
        expect(on(wide, 100, 230)).toEqual({ lineStartId: null });
        expect(on(wide, 100, 250)).toBeNull();
        expect(on(wide, 300, -10)).toEqual(before('p3'));
    });

    it('keeps "Add filter" as its row\'s first slot when a wide section wraps below it', () => {
        const alone: BarLayout = {
            start: box(0, 80),
            lines: [
                {
                    lineStartId: null,
                    items: [
                        {
                            id: 'W',
                            rect: box(0, 690, 40, 76),
                            section: {
                                head: box(4, 90, 44, 72),
                                end: box(630, 686, 44, 72),
                                members: [
                                    { id: 'w1', rect: box(96, 206, 44, 72) },
                                ],
                            },
                        },
                    ],
                },
            ],
        };
        expect(on(alone, 100, 14)).toEqual({ barStart: true });
        expect(on(alone, 600, 14)).toEqual({ barStart: true });
        expect(on(alone, 40, 34)).toEqual({ barStart: true });
    });

    it('lands between stacked capsules on a narrow bar, at 28px and 44px', () => {
        const narrow: BarLayout = {
            start: box(0, 80),
            lines: [
                {
                    lineStartId: null,
                    items: [P('p1', box(86, 196)), P('p2', box(202, 312))],
                },
                {
                    lineStartId: 'S1',
                    items: [
                        folded('S1', box(0, 180, 40, 76)),
                        folded('S2', box(0, 150, 84, 120)),
                    ],
                },
                {
                    lineStartId: 'S3',
                    items: [folded('S3', box(0, 220, 128, 164))],
                },
            ],
        };
        expect(on(narrow, 300, 58)).toEqual(after('S1'));
        expect(on(narrow, 100, 80)).toEqual(after('S1'));
        expect(on(narrow, 100, 80, true)).toEqual(after('S1'));
        expect(on(narrow, 300, 102)).toEqual(after('S2'));
        expect(on(narrow, 160, 102)).toEqual(after('S2'));
        expect(on(narrow, 100, 124)).toEqual({ lineStartId: 'S3' });
        expect(on(narrow, 120, 58, true)).toEqual(after('S1'));
        const tall: BarLayout = {
            start: box(0, 90, 0, 44),
            lines: [
                { lineStartId: null, items: [P('p1', box(96, 206, 0, 44))] },
                {
                    lineStartId: 'S1',
                    items: [
                        folded('S1', box(0, 180, 56, 108)),
                        folded('S2', box(0, 150, 116, 168)),
                    ],
                },
            ],
        };
        expect(on(tall, 300, 80)).toEqual(after('S1'));
        expect(on(tall, 100, 112)).toEqual(after('S1'));
        expect(on(tall, 120, 80)).toEqual({ sectionId: 'S1' });
        expect(on(tall, 20, 52)).toEqual({ lineStartId: 'S1' });
        expect(on(tall, 300, 30)).toEqual(after('p1'));
    });
});
