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
        expect(at(150, 60)).toEqual({ overId: 'T', side: 'after' });
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
