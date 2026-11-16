import { describe, expect, it } from 'vitest';
import {
    ACTUAL_SIZE_ZOOM,
    getFitZoom,
    MIN_CANVAS_ZOOM,
    stepCanvasZoom,
} from './canvasZoomUtils';

describe('stepCanvasZoom', () => {
    it('never zooms in past actual size', () => {
        expect(stepCanvasZoom(ACTUAL_SIZE_ZOOM, 'in')).toBe(ACTUAL_SIZE_ZOOM);
    });

    it('never zooms out past the smallest size', () => {
        expect(stepCanvasZoom(MIN_CANVAS_ZOOM, 'out')).toBe(MIN_CANVAS_ZOOM);
    });

    it('moves a fitted zoom to the nearest step in each direction', () => {
        expect(stepCanvasZoom(0.41, 'in')).toBe(0.5);
        expect(stepCanvasZoom(0.41, 'out')).toBe(0.33);
    });

    it('zooming out then in returns to actual size', () => {
        const out = stepCanvasZoom(ACTUAL_SIZE_ZOOM, 'out');
        expect(out).toBeLessThan(ACTUAL_SIZE_ZOOM);
        expect(stepCanvasZoom(out, 'in')).toBe(ACTUAL_SIZE_ZOOM);
    });
});

describe('getFitZoom', () => {
    it('shrinks a tall dashboard to the available height', () => {
        expect(getFitZoom(600, 1200)).toBe(0.5);
    });

    it('rounds down so the last row is never cut off', () => {
        const zoom = getFitZoom(600, 1700);
        expect(zoom * 1700).toBeLessThanOrEqual(600);
    });

    it('keeps a dashboard that already fits at actual size', () => {
        expect(getFitZoom(900, 400)).toBe(ACTUAL_SIZE_ZOOM);
    });

    it('stops at the smallest size for a very long dashboard', () => {
        expect(getFitZoom(600, 20000)).toBe(MIN_CANVAS_ZOOM);
    });

    it('stays at actual size for an empty dashboard', () => {
        expect(getFitZoom(600, 0)).toBe(ACTUAL_SIZE_ZOOM);
    });
});
