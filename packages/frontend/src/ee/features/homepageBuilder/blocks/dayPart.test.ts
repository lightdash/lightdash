import { dayPart } from './dayPart';

describe('dayPart', () => {
    it('greets late night (midnight to 4:59) as evening', () => {
        expect(dayPart(0)).toBe('evening');
        expect(dayPart(1)).toBe('evening');
        expect(dayPart(4)).toBe('evening');
    });

    it('greets 5:00 to 11:59 as morning', () => {
        expect(dayPart(5)).toBe('morning');
        expect(dayPart(11)).toBe('morning');
    });

    it('greets 12:00 to 17:59 as afternoon', () => {
        expect(dayPart(12)).toBe('afternoon');
        expect(dayPart(17)).toBe('afternoon');
    });

    it('greets 18:00 to 23:59 as evening', () => {
        expect(dayPart(18)).toBe('evening');
        expect(dayPart(23)).toBe('evening');
    });
});
