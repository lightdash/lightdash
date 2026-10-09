import { describe, expect, it } from 'vitest';
import { formatCount, formatQuantity, PEOPLE } from './format';

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

describe('formatQuantity', () => {
    const queries = { one: 'query', other: 'queries' };
    it('uses the singular for one', () => {
        expect(formatQuantity(1, queries)).toBe('1 query');
    });
    it('uses the plural otherwise and groups thousands', () => {
        expect(formatQuantity(0, queries)).toBe('0 queries');
        expect(formatQuantity(37405, { one: 'view', other: 'views' })).toBe(
            '37,405 views',
        );
    });
    it('counts people', () => {
        expect(formatQuantity(1, PEOPLE)).toBe('1 person');
        expect(formatQuantity(1951, PEOPLE)).toBe('1,951 people');
    });
});
