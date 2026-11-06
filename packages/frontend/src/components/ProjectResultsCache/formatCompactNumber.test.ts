import { describe, expect, test } from 'vitest';
import { formatCompactNumber } from './formatCompactNumber';

describe('formatCompactNumber', () => {
    test.each([
        [0, '0'],
        [999, '999'],
        [1_953, '2K'],
        [12_480, '12.5K'],
        [1_250_000, '1.3M'],
        [3_000_000_000, '3B'],
    ])('%d is %s', (value, expected) => {
        expect(formatCompactNumber(value)).toBe(expected);
    });
});
