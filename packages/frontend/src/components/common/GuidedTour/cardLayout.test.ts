import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cardLayout } from './cardLayout';

const rect = (left: number, top: number, width: number, height: number) =>
    new DOMRect(left, top, width, height);

describe('cardLayout', () => {
    const original = { w: window.innerWidth, h: window.innerHeight };
    beforeEach(() => {
        Object.assign(window, { innerWidth: 1440, innerHeight: 900 });
    });
    afterEach(() => {
        Object.assign(window, {
            innerWidth: original.w,
            innerHeight: original.h,
        });
    });

    it('sits under a control with room below it, centred on it', () => {
        const layout = cardLayout(rect(600, 100, 120, 36), 300);
        expect(layout.placement).toBe('below');
        expect(layout.top).toBe(100 + 36 + 14);
        expect(layout.left + layout.width / 2).toBe(660);
    });

    it('flips above a control near the bottom of the page', () => {
        const layout = cardLayout(rect(600, 820, 120, 36), 300);
        expect(layout.placement).toBe('above');
        expect(layout.top).toBe(820 - 14 - 300);
    });

    it('overlaps a wide, tall target against its right edge, clear of what it holds', () => {
        // The workspace editor: too tall for the card to go above or below.
        const editor = rect(320, 120, 1110, 500);
        const layout = cardLayout(editor, 520);
        expect(layout.placement).toBe('inside');
        expect(layout.left + layout.width).toBe(320 + 1110 - 14);
        // The left of the editor, where the code is, stays uncovered.
        expect(layout.left - editor.left).toBeGreaterThanOrEqual(560);
        expect(layout.width).toBe(480);
    });

    it('narrows an overlapping card rather than cover more of a tighter target', () => {
        const editor = rect(240, 120, 860, 390);
        Object.assign(window, { innerWidth: 1100, innerHeight: 750 });
        const layout = cardLayout(editor, 420);
        expect(layout.placement).toBe('inside');
        expect(layout.width).toBe(340);
        expect(layout.left - editor.left).toBeGreaterThanOrEqual(500);
    });

    it('keeps an overlapping card centred on a target with no room beside it', () => {
        const modal = rect(420, 20, 600, 860);
        const layout = cardLayout(modal, 400);
        expect(layout.placement).toBe('inside');
        expect(layout.left + layout.width / 2).toBe(720);
    });

    it('never leaves the viewport, whatever the target', () => {
        const layout = cardLayout(rect(1300, 120, 400, 700), 520);
        expect(layout.left + layout.width).toBeLessThanOrEqual(1440 - 12);
        expect(layout.top).toBeGreaterThanOrEqual(12);
        expect(layout.top + 520).toBeLessThanOrEqual(900 - 12);
    });
});
