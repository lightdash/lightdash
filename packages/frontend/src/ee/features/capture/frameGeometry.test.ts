import { describe, expect, it } from 'vitest';
import { sameScreen } from './frameGeometry';

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
