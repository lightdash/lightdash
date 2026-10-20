import { describe, expect, it } from 'vitest';
import { isZoomGesture } from './zoomGesture';

const event = (type: string, over: Record<string, unknown> = {}) => ({
    type,
    ctrlKey: false,
    metaKey: false,
    ...over,
});

describe('isZoomGesture', () => {
    it('leaves a plain wheel to scroll the page', () => {
        expect(isZoomGesture(event('wheel'))).toBe(false);
    });
    it('zooms on a wheel with Ctrl or ⌘ held, which covers a trackpad pinch', () => {
        expect(isZoomGesture(event('wheel', { ctrlKey: true }))).toBe(true);
        expect(isZoomGesture(event('wheel', { metaKey: true }))).toBe(true);
    });
    it('leaves a one-finger swipe to scroll the page and takes two fingers', () => {
        expect(
            isZoomGesture(event('touchstart', { touches: { length: 1 } })),
        ).toBe(false);
        expect(
            isZoomGesture(event('touchstart', { touches: { length: 2 } })),
        ).toBe(true);
    });
    it('moves a zoomed map with one finger', () => {
        const swipe = event('touchstart', { touches: { length: 1 } });
        expect(isZoomGesture(swipe, 1)).toBe(false);
        expect(isZoomGesture(swipe, 1.6)).toBe(true);
        expect(isZoomGesture(event('wheel'), 3)).toBe(false);
    });
    it('drags with the main mouse button only', () => {
        expect(isZoomGesture(event('mousedown', { button: 0 }))).toBe(true);
        expect(isZoomGesture(event('mousedown', { button: 2 }))).toBe(false);
        expect(
            isZoomGesture(event('mousedown', { button: 0, ctrlKey: true })),
        ).toBe(false);
    });
});
