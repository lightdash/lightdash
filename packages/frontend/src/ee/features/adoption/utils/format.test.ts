import { describe, expect, it } from 'vitest';
import { formatCount } from './format';

describe('formatCount', () => {
    it('groups thousands with commas', () => {
        expect(formatCount(1951)).toBe('1,951');
        expect(formatCount(2350)).toBe('2,350');
        expect(formatCount(1234567)).toBe('1,234,567');
    });
    it('leaves small numbers alone', () => {
        expect(formatCount(0)).toBe('0');
        expect(formatCount(12)).toBe('12');
        expect(formatCount(999)).toBe('999');
    });
});
