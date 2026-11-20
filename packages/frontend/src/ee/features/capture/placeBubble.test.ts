import { describe, expect, it } from 'vitest';
import { placeBubble } from './placeBubble';

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
