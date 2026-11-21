import { describe, expect, it } from 'vitest';
import { placeBubble, placeClear } from './placeBubble';

const viewport = new DOMRect(0, 0, 800, 600);
const size = { width: 200, height: 100 };
const overlaps = (a: DOMRect, b: DOMRect) =>
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top;

describe('placeBubble', () => {
    it('stays put when the new mark is far away', () => {
        const at = placeBubble({
            markRect: new DOMRect(600, 400, 50, 50),
            current: new DOMRect(100, 100, 200, 100),
            size,
            viewport,
            pointer: { x: 640, y: 420 },
        });
        expect(at).toEqual({ x: 100, y: 100 });
    });

    it('a bubble scrolled out of view comes back beside the new mark', () => {
        const markRect = new DOMRect(400, 300, 100, 100);
        const pointer = { x: 490, y: 350 };
        [
            new DOMRect(100, -400, 200, 100),
            new DOMRect(100, 560, 200, 100),
            new DOMRect(-50, 100, 200, 100),
            new DOMRect(700, 100, 200, 100),
        ].forEach((current) => {
            expect(
                placeBubble({ markRect, current, size, viewport, pointer }),
            ).toEqual({ x: 168, y: 300 });
        });
    });

    it('a bubble taller than the viewport stays put while its top is in view', () => {
        const tall = { width: 200, height: 900 };
        expect(
            placeBubble({
                markRect: new DOMRect(600, 400, 50, 50),
                current: new DOMRect(100, 0, 200, 900),
                size: tall,
                viewport,
                pointer: { x: 640, y: 420 },
            }),
        ).toEqual({ x: 100, y: 0 });
    });

    it('moves beside the mark, away from the pointer, when they overlap', () => {
        const markRect = new DOMRect(400, 300, 100, 100);
        const current = new DOMRect(420, 320, 200, 100);
        // The pointer ended on the mark's right, so the bubble goes left.
        expect(
            placeBubble({
                markRect,
                current,
                size,
                viewport,
                pointer: { x: 490, y: 350 },
            }),
        ).toEqual({ x: 168, y: 300 });
        expect(
            placeBubble({
                markRect,
                current,
                size,
                viewport,
                pointer: { x: 410, y: 350 },
            }),
        ).toEqual({ x: 532, y: 300 });
    });

    it('moves when the bubble sits within 24px of the mark', () => {
        const at = placeBubble({
            markRect: new DOMRect(400, 300, 100, 100),
            current: new DOMRect(510, 300, 200, 100),
            size,
            viewport,
            pointer: { x: 410, y: 350 },
        });
        expect(at).toEqual({ x: 532, y: 300 });
    });

    it('opens beside the first mark when there is no bubble yet', () => {
        const at = placeBubble({
            markRect: new DOMRect(400, 300, 100, 100),
            current: null,
            size,
            viewport,
            pointer: { x: 410, y: 350 },
        });
        expect(at).toEqual({ x: 532, y: 300 });
    });

    it('stays inside the viewport', () => {
        const corners = [
            {
                markRect: new DOMRect(10, 10, 50, 50),
                pointer: { x: 50, y: 30 },
            },
            {
                markRect: new DOMRect(700, 580, 80, 15),
                pointer: { x: 710, y: 590 },
            },
        ];
        corners.forEach(({ markRect, pointer }) => {
            const at = placeBubble({
                markRect,
                current: null,
                size,
                viewport,
                pointer,
            });
            expect(at.x).toBeGreaterThanOrEqual(16);
            expect(at.y).toBeGreaterThanOrEqual(16);
            expect(at.x + size.width).toBeLessThanOrEqual(800 - 16);
            expect(at.y + size.height).toBeLessThanOrEqual(600 - 16);
            expect(
                overlaps(
                    new DOMRect(at.x, at.y, size.width, size.height),
                    markRect,
                ),
            ).toBe(false);
        });
    });
});

describe('placeClear', () => {
    const big = { width: 300, height: 300 };
    const at = (p: { x: number; y: number }) =>
        new DOMRect(p.x, p.y, big.width, big.height);

    it('a bubble that grew over its mark moves off it', () => {
        const mark = new DOMRect(380, 250, 80, 60);
        const placed = placeClear({
            marks: [mark],
            current: { x: 300, y: 200 },
            size: big,
            viewport,
        });
        expect(overlaps(at(placed), mark)).toBe(false);
    });

    it('stays clear of every mark, not only the newest', () => {
        const first = new DOMRect(40, 150, 80, 60);
        const newest = new DOMRect(380, 150, 80, 60);
        const placed = placeClear({
            marks: [first, newest],
            current: { x: 100, y: 100 },
            size: big,
            viewport,
        });
        expect(overlaps(at(placed), first)).toBe(false);
        expect(overlaps(at(placed), newest)).toBe(false);
    });

    it('stays inside the room it is given', () => {
        const room = new DOMRect(0, 0, 800, 520);
        const mark = new DOMRect(600, 400, 80, 60);
        const placed = placeClear({
            marks: [mark],
            current: { x: 560, y: 380 },
            size: big,
            viewport: room,
        });
        expect(placed.y + big.height).toBeLessThanOrEqual(520 - 16);
        expect(placed.x).toBeGreaterThanOrEqual(16);
    });

    it('covers as little of the marks as it can when no place is clear', () => {
        const block = new DOMRect(0, 0, 560, 600);
        const placed = placeClear({
            marks: [block],
            current: { x: 100, y: 80 },
            size: big,
            viewport,
        });
        expect(placed.x).toBe(484);
    });

    it('stays where it is when that covers no mark', () => {
        expect(
            placeClear({
                marks: [new DOMRect(600, 400, 80, 60)],
                current: { x: 100, y: 100 },
                size: big,
                viewport,
            }),
        ).toEqual({ x: 100, y: 100 });
    });

    it('with no marks on screen it only comes inside the room', () => {
        expect(
            placeClear({
                marks: [],
                current: { x: -50, y: 900 },
                size: big,
                viewport,
            }),
        ).toEqual({ x: 16, y: 284 });
    });
});
