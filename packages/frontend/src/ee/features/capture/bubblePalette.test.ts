import { describe, expect, it } from 'vitest';
import { BUBBLE_COLOR_COUNT, bubbleColor } from './bubblePalette';
import { INK_COLOR } from './composeImage';

const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

describe('bubblePalette', () => {
    const colors = Array.from({ length: BUBBLE_COLOR_COUNT }, (_, i) =>
        bubbleColor(i),
    );

    it('has six different colours, the first the red the agent is shown', () => {
        expect(new Set(colors).size).toBe(6);
        expect(colors[0]).toBe(INK_COLOR);
    });

    it('white numbers read on every colour', () => {
        colors.forEach((color) =>
            expect(contrast(color, '#ffffff')).toBeGreaterThanOrEqual(4.5),
        );
    });

    it('every colour shows on a light and on a dark page', () => {
        colors.forEach((color) => {
            expect(contrast(color, '#ffffff')).toBeGreaterThanOrEqual(3);
            expect(contrast(color, '#1a1b1e')).toBeGreaterThanOrEqual(3);
        });
    });

    it('an index past the end comes round again', () => {
        expect(bubbleColor(BUBBLE_COLOR_COUNT + 1)).toBe(colors[1]);
    });
});
