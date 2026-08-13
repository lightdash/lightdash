import { describe, expect, it } from 'vitest';
import { cardLayout } from './cardLayout';

const rectOf = (
    top: number,
    height: number,
    left = 400,
    width = 200,
): DOMRect =>
    ({
        top,
        left,
        width,
        height,
        bottom: top + height,
        right: left + width,
        x: left,
        y: top,
    }) as DOMRect;

describe('cardLayout', () => {
    const cardHeight = 200;

    it('sits below a target with room under it', () => {
        const layout = cardLayout(rectOf(40, 40), cardHeight);
        expect(layout.placement).toBe('below');
        expect(layout.top).toBe(94);
    });

    it('flips above a target with no room under it', () => {
        const layout = cardLayout(
            rectOf(window.innerHeight - 60, 40),
            cardHeight,
        );
        expect(layout.placement).toBe('above');
    });

    it('keeps the card on screen when the target is taller than the space around it', () => {
        const layout = cardLayout(
            rectOf(20, window.innerHeight - 40, 20, window.innerWidth - 40),
            cardHeight,
        );
        expect(layout.placement).toBe('inside');
        expect(layout.top).toBeGreaterThanOrEqual(0);
        expect(layout.top + cardHeight).toBeLessThanOrEqual(window.innerHeight);
    });

    it('keeps a card taller than the viewport within it', () => {
        const layout = cardLayout(
            rectOf(0, window.innerHeight, 0, window.innerWidth),
            window.innerHeight + 200,
        );
        expect(layout.top).toBeGreaterThanOrEqual(0);
    });
});
