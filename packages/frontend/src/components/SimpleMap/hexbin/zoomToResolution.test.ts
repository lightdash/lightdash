import { zoomToResolution } from './zoomToResolution';

describe('zoomToResolution', () => {
    it('returns res 1 at world zoom', () => {
        expect(zoomToResolution(0)).toBe(1);
        expect(zoomToResolution(2)).toBe(1);
    });

    it('increases resolution as zoom increases', () => {
        expect(zoomToResolution(3)).toBe(2);
        expect(zoomToResolution(5)).toBe(4);
        expect(zoomToResolution(10)).toBe(7);
        expect(zoomToResolution(12)).toBe(9);
    });

    it('caps at res 12 for very high zoom', () => {
        expect(zoomToResolution(15)).toBe(12);
        expect(zoomToResolution(20)).toBe(12);
    });

    it('handles fractional zoom by flooring', () => {
        expect(zoomToResolution(4.7)).toBe(zoomToResolution(4));
    });
});
