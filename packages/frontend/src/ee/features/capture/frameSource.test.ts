import { describe, expect, it } from 'vitest';
import { pageRectForRegion } from './frameSource';

describe('pageRectForRegion', () => {
    const viewport = { width: 1440, height: 810 };

    it('adds the page scroll to a full-viewport region', () => {
        expect(
            pageRectForRegion(
                { x: 0, y: 0, width: 1440, height: 810 },
                viewport,
                { x: 0, y: 300 },
            ),
        ).toEqual({ x: 0, y: 300, width: 1440, height: 810 });
    });

    it('clips a region that runs off screen', () => {
        expect(
            pageRectForRegion(
                { x: -20, y: 700, width: 500, height: 400 },
                viewport,
                { x: 10, y: 0 },
            ),
        ).toEqual({ x: 10, y: 700, width: 480, height: 110 });
    });

    it('is empty when the region is wholly off screen', () => {
        const rect = pageRectForRegion(
            { x: 0, y: 900, width: 100, height: 100 },
            viewport,
            { x: 0, y: 0 },
        );
        expect(rect.height).toBe(0);
    });
});
