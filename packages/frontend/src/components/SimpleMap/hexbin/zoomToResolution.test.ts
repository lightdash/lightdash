import { zoomToResolution } from './zoomToResolution';

describe('zoomToResolution', () => {
    it('returns res 1 at world zoom', () => {
        expect(zoomToResolution(0)).toBe(1);
        expect(zoomToResolution(2)).toBe(1);
    });

    it('increases resolution as zoom increases', () => {
        expect(zoomToResolution(3)).toBe(1);
        expect(zoomToResolution(5)).toBe(3);
        expect(zoomToResolution(10)).toBe(6);
        expect(zoomToResolution(12)).toBe(8);
    });

    it('caps at res 11 for very high zoom', () => {
        expect(zoomToResolution(15)).toBe(11);
        expect(zoomToResolution(20)).toBe(11);
    });

    it('handles fractional zoom by flooring', () => {
        expect(zoomToResolution(4.7)).toBe(zoomToResolution(4));
    });
});
