import { describe, expect, it } from 'vitest';
import { followAnchors } from './followAnchors';
import { type LayerMark } from './types';

const mark = (box: LayerMark['box'], strokes: LayerMark['strokes'] = []) => ({
    bubbleId: 'b',
    number: 1,
    tabUuid: null,
    box,
    strokes,
    outlined: true,
});
const tile = (id: string, x: number, y: number, width = 100, height = 100) => ({
    id,
    rect: { x, y, width, height },
});

describe('followAnchors', () => {
    it('moves a mark with the tile it was made on', () => {
        const [moved] = followAnchors(
            [mark({ x: 0, y: 0, width: 100, height: 100 })],
            [tile('a', 0, 0), tile('b', 100, 0)],
            [tile('a', 100, 0), tile('b', 0, 0)],
        );
        expect(moved.box).toEqual({ x: 100, y: 0, width: 100, height: 100 });
    });

    it('keeps a mark at the same place inside a tile that changed size', () => {
        const [moved] = followAnchors(
            [
                mark({ x: 50, y: 50, width: 20, height: 10 }, [
                    { points: [{ x: 50, y: 50 }] },
                ]),
            ],
            [tile('a', 0, 0)],
            [tile('a', 200, 300, 200, 50)],
        );
        expect(moved.box).toEqual({ x: 300, y: 325, width: 40, height: 5 });
        expect(moved.strokes[0].points[0]).toEqual({ x: 300, y: 325 });
    });

    it('drops a mark whose tile is gone, and leaves one that is on no tile', () => {
        const onTile = mark({ x: 10, y: 10, width: 10, height: 10 });
        const offTile = mark({ x: 500, y: 500, width: 10, height: 10 });
        expect(followAnchors([onTile, offTile], [tile('a', 0, 0)], [])).toEqual(
            [offTile],
        );
    });

    it('returns the same mark when its tile did not move', () => {
        const still = mark({ x: 10, y: 10, width: 10, height: 10 });
        const [after] = followAnchors(
            [still],
            [tile('a', 0, 0)],
            [tile('a', 0, 0)],
        );
        expect(after).toBe(still);
    });
});
