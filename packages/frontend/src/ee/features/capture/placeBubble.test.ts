import { describe, expect, it } from 'vitest';
import { ATTACHED_PX, besideMarks, intoView } from './placeBubble';

const viewport = new DOMRect(0, 0, 800, 600);
const size = { width: 200, height: 100 };
const place = (
    marks: DOMRect[],
    over: Partial<Parameters<typeof besideMarks>[0]> = {},
) =>
    besideMarks({
        marks,
        current: null,
        size,
        bounds: viewport,
        avoid: [],
        reach: ATTACHED_PX,
        ...over,
    });

describe('besideMarks', () => {
    it('opens to the right of its mark, a small gap away', () => {
        expect(place([new DOMRect(400, 300, 100, 100)])).toEqual({
            x: 512,
            y: 300,
        });
    });

    it('goes left when the right has no room', () => {
        expect(place([new DOMRect(650, 300, 100, 100)])).toEqual({
            x: 438,
            y: 300,
        });
    });

    it('goes below, then above, when neither side has room', () => {
        expect(place([new DOMRect(20, 100, 760, 50)])).toEqual({
            x: 20,
            y: 162,
        });
        expect(place([new DOMRect(20, 450, 760, 100)])).toEqual({
            x: 20,
            y: 338,
        });
    });

    it('sits beside all of its marks together', () => {
        expect(
            place([
                new DOMRect(100, 100, 50, 50),
                new DOMRect(100, 300, 50, 50),
            ]),
        ).toEqual({ x: 162, y: 100 });
    });

    it('stays where it is while that is beside its marks', () => {
        const current = { x: 170, y: 120 };
        expect(
            place(
                [
                    new DOMRect(100, 100, 50, 50),
                    new DOMRect(100, 200, 50, 50),
                    new DOMRect(100, 300, 50, 50),
                ],
                { current },
            ),
        ).toEqual(current);
    });

    it('a bubble far from its marks comes beside them', () => {
        expect(
            place(
                [new DOMRect(60, 200, 40, 30), new DOMRect(60, 260, 40, 30)],
                { current: { x: 500, y: 300 } },
            ),
        ).toEqual({ x: 112, y: 200 });
    });

    it('moves off a mark made under it', () => {
        const mark = new DOMRect(300, 150, 60, 60);
        const at = place([new DOMRect(100, 100, 50, 50), mark], {
            current: { x: 162, y: 100 },
        });
        expect(at).not.toEqual({ x: 162, y: 100 });
        expect(at.x >= mark.right || at.x + size.width <= mark.left).toBe(true);
    });

    it('takes a free side over one another bubble is on', () => {
        expect(
            place([new DOMRect(400, 300, 100, 100)], {
                avoid: [new DOMRect(520, 280, 200, 200)],
            }),
        ).toEqual({ x: 188, y: 300 });
    });

    it('boxed in on every side, it goes past the others, even out of view', () => {
        const others = [
            new DOMRect(0, 0, 800, 290),
            new DOMRect(0, 410, 800, 190),
            new DOMRect(520, 280, 280, 200),
            new DOMRect(0, 280, 390, 200),
        ];
        expect(
            place([new DOMRect(400, 300, 100, 100)], { avoid: others }),
        ).toEqual({ x: 400, y: 612 });
    });

    it('with another bubble on every side, it takes the nearest spot clear of them all', () => {
        const at = place([new DOMRect(400, 300, 100, 100)], {
            avoid: [
                new DOMRect(500, 250, 300, 150),
                new DOMRect(0, 250, 400, 150),
                new DOMRect(380, 400, 40, 30),
            ],
        });
        expect(at).toEqual({ x: 512, y: 412 });
    });

    it('covers as little of its marks as it can when no side is clear', () => {
        const at = place([new DOMRect(0, 0, 700, 600)]);
        expect(at.x).toBe(584);
    });

    it('is not kept inside the viewport when it has the whole page', () => {
        const page = new DOMRect(0, -1000, 800, 3000);
        expect(
            place([new DOMRect(400, -500, 100, 100)], { bounds: page }),
        ).toEqual({ x: 512, y: -500 });
        // Where it was, off screen, is still beside its marks.
        expect(
            place([new DOMRect(400, -500, 100, 100)], {
                bounds: page,
                current: { x: 520, y: -480 },
            }),
        ).toEqual({ x: 520, y: -480 });
    });

    it('scrolled out of the viewport, it comes back beside its marks', () => {
        expect(
            place([new DOMRect(400, 300, 100, 100)], {
                current: { x: 512, y: -400 },
            }),
        ).toEqual({ x: 512, y: 300 });
    });

    it('with a long reach it only moves off a mark or back into its room', () => {
        const current = { x: 500, y: 400 };
        expect(
            place([new DOMRect(60, 60, 40, 30)], { current, reach: Infinity }),
        ).toEqual(current);
    });

    it('with no marks on screen it stays where it is', () => {
        expect(place([], { current: { x: 40, y: 900 } })).toEqual({
            x: 40,
            y: 900,
        });
    });
});

describe('intoView', () => {
    it('brings a bubble back inside the viewport', () => {
        expect(intoView(new DOMRect(-50, 900, 200, 100), viewport)).toEqual({
            x: 16,
            y: 484,
        });
        expect(intoView(new DOMRect(100, 100, 200, 100), viewport)).toEqual({
            x: 100,
            y: 100,
        });
    });
});
