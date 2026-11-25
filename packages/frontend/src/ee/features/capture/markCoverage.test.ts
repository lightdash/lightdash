import { describe, expect, it } from 'vitest';
import { coveredTargets } from './markCoverage';
import { type CaptureTarget, type Point } from './types';

const tile = (id: string): CaptureTarget => ({
    kind: 'tile',
    id,
    label: id,
    parentId: null,
});

// A title strip across the top, two charts side by side under it.
const resolve = (point: Point): CaptureTarget | null => {
    if (point.y < 0.2) return tile('title');
    if (point.y > 0.8) return null;
    return point.x < 0.5 ? tile('left') : tile('right');
};

describe('coveredTargets', () => {
    it('shares a circle around two charts between them, not the tile it clips', () => {
        const covers = coveredTargets(
            { x: 0.1, y: 0.15, width: 0.8, height: 0.6 },
            resolve,
        );
        expect(covers.map((cover) => cover.target.id)).toEqual([
            'left',
            'right',
            'title',
        ]);
        expect(covers[0].share).toBeCloseTo(0.42, 1);
        expect(covers[1].share).toBeCloseTo(0.42, 1);
        expect(covers[2].share).toBeLessThan(0.2);
    });

    it('gives a mark inside one tile wholly to that tile', () => {
        expect(
            coveredTargets(
                { x: 0.6, y: 0.4, width: 0.05, height: 0.05 },
                resolve,
            ),
        ).toEqual([{ target: tile('right'), share: 1 }]);
    });

    it('leaves out area that is on nothing', () => {
        expect(
            coveredTargets({ x: 0, y: 0.85, width: 1, height: 0.1 }, resolve),
        ).toEqual([]);
    });
});
