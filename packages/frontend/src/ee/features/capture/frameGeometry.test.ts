import { describe, expect, it } from 'vitest';
import {
    cropRectForRegion,
    isFrameFromThisTab,
    sameScreen,
} from './frameGeometry';

describe('isFrameFromThisTab', () => {
    it('accepts a 2x frame of the same viewport', () => {
        expect(
            isFrameFromThisTab(
                { width: 2880, height: 1620 },
                { width: 1440, height: 810 },
            ),
        ).toBe(true);
    });

    it('rejects a frame with a different shape (another window)', () => {
        expect(
            isFrameFromThisTab(
                { width: 1920, height: 1080 },
                { width: 1440, height: 600 },
            ),
        ).toBe(false);
    });

    it('rejects an empty frame', () => {
        expect(
            isFrameFromThisTab(
                { width: 0, height: 0 },
                { width: 1440, height: 810 },
            ),
        ).toBe(false);
    });
});

describe('cropRectForRegion', () => {
    it('scales the region by frame over viewport', () => {
        expect(
            cropRectForRegion(
                { x: 400, y: 100, width: 800, height: 500 },
                { width: 1440, height: 810 },
                { width: 2880, height: 1620 },
            ),
        ).toEqual({ x: 800, y: 200, width: 1600, height: 1000 });
    });

    it('clamps a region that runs off the viewport', () => {
        expect(
            cropRectForRegion(
                { x: 1000, y: 700, width: 800, height: 500 },
                { width: 1440, height: 810 },
                { width: 1440, height: 810 },
            ),
        ).toEqual({ x: 1000, y: 700, width: 440, height: 110 });
    });
});

describe('sameScreen', () => {
    it('near-identical thumbs are the same screen', () => {
        expect(
            sameScreen(
                new Uint8ClampedArray(4096).fill(100),
                new Uint8ClampedArray(4096).fill(102),
            ),
        ).toBe(true);
    });

    it('shifted content is a different screen', () => {
        const a = new Uint8ClampedArray(4096).fill(0);
        const b = new Uint8ClampedArray(4096).fill(0);
        a.fill(255, 0, 2048);
        b.fill(255, 1024, 3072);
        expect(sameScreen(a, b)).toBe(false);
    });

    it('thumbs of different sizes are different screens', () => {
        expect(
            sameScreen(new Uint8ClampedArray(16), new Uint8ClampedArray(64)),
        ).toBe(false);
    });
});
