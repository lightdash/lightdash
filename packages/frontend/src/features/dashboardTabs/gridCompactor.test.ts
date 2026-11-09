import { type Layout } from 'react-grid-layout';
import { keepPositionsCompactor } from './gridCompactor';

const COLS = 36;

const overlaps = (a: Layout[number], b: Layout[number]) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('keepPositionsCompactor', () => {
    it('keeps intentional gaps instead of pulling tiles up', () => {
        const layout: Layout = [
            { i: 'top', x: 0, y: 0, w: 36, h: 2 },
            { i: 'lower', x: 0, y: 6, w: 36, h: 2 },
        ];

        expect(keepPositionsCompactor.compact(layout, COLS)).toEqual([
            expect.objectContaining({ i: 'top', y: 0 }),
            expect.objectContaining({ i: 'lower', y: 6 }),
        ]);
    });

    it('pushes a tile down when another grows into it', () => {
        const layout: Layout = [
            { i: 'grown', x: 0, y: 0, w: 18, h: 8 },
            { i: 'below', x: 0, y: 4, w: 36, h: 2 },
            { i: 'further', x: 0, y: 6, w: 36, h: 2 },
        ];

        const compacted = keepPositionsCompactor.compact(layout, COLS);

        expect(compacted.find((item) => item.i === 'below')?.y).toBe(8);
        expect(compacted.find((item) => item.i === 'further')?.y).toBe(10);
        compacted.forEach((a, index) =>
            compacted.slice(index + 1).forEach((b) => {
                expect(overlaps(a, b)).toBe(false);
            }),
        );
    });

    it('leaves side-by-side tiles alone', () => {
        const layout: Layout = [
            { i: 'left', x: 0, y: 0, w: 18, h: 8 },
            { i: 'right', x: 18, y: 0, w: 18, h: 4 },
        ];

        expect(keepPositionsCompactor.compact(layout, COLS)).toEqual([
            expect.objectContaining({ i: 'left', x: 0, y: 0 }),
            expect.objectContaining({ i: 'right', x: 18, y: 0 }),
        ]);
    });

    it('returns items in their original order', () => {
        const layout: Layout = [
            { i: 'b', x: 0, y: 4, w: 36, h: 2 },
            { i: 'a', x: 0, y: 0, w: 36, h: 2 },
        ];

        expect(
            keepPositionsCompactor.compact(layout, COLS).map((item) => item.i),
        ).toEqual(['b', 'a']);
    });
});
