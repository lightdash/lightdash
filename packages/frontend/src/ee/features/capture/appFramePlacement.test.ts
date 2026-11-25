import { describe, expect, it } from 'vitest';
import { appFramePlacement } from './appFramePlacement';

const page = { x: 0, y: 500, width: 1000, height: 800 };

describe('appFramePlacement', () => {
    it('puts a frame where it sits in the pictured part of the page', () => {
        expect(
            appFramePlacement({
                frame: { x: 100, y: 700, width: 400, height: 300 },
                page,
                scale: 2,
                picture: { width: 800, height: 600 },
            }),
        ).toEqual({
            source: { x: 0, y: 0, width: 800, height: 600 },
            target: { x: 200, y: 400, width: 800, height: 600 },
        });
    });

    it('uses only the part a scrolling frame shows in its window', () => {
        const placed = appFramePlacement({
            frame: { x: 0, y: 500, width: 400, height: 300 },
            page,
            scale: 1,
            picture: { width: 400, height: 2000 },
        });
        expect(placed?.source.height).toBe(300);
        expect(placed?.target.height).toBe(300);
    });

    it('skips a frame that is not in the picture', () => {
        expect(
            appFramePlacement({
                frame: { x: 0, y: 0, width: 400, height: 300 },
                page,
                scale: 1,
                picture: { width: 400, height: 300 },
            }),
        ).toBeNull();
    });
});
