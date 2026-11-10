import { getFinestLevel, isFinerLevel } from './apiSourceLevels';

const LEVELS = ['account', 'campaign', 'ad'] as const;

describe('getFinestLevel', () => {
    it('picks the finest selected level', () => {
        expect(getFinestLevel(LEVELS, ['ad', 'account', null])).toBe('ad');
    });

    it('is null when nothing is selected', () => {
        expect(getFinestLevel(LEVELS, [undefined])).toBeNull();
    });
});

describe('isFinerLevel', () => {
    it('compares by position in the hierarchy', () => {
        expect(isFinerLevel(LEVELS, 'ad', 'campaign')).toBe(true);
        expect(isFinerLevel(LEVELS, 'account', 'campaign')).toBe(false);
        expect(isFinerLevel(LEVELS, 'ad', 'ad')).toBe(false);
    });
});
