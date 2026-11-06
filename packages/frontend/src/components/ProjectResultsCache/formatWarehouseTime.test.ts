import { describe, expect, test } from 'vitest';
import { formatWarehouseTime } from './formatWarehouseTime';

describe('formatWarehouseTime', () => {
    test.each([
        [0, '0ms'],
        [999, '999ms'],
        [1000, '1.0s'],
        [59_999, '59.9s'],
        [60_000, '1m'],
        [125_000, '2m 5s'],
        [3_599_999, '59m 59s'],
        [3_600_000, '1.0h'],
        [180_000_000, '50.0h'],
        [11_520_000, '3.2h'],
        [40_700_000, '~11.3h'],
    ])('%d ms -> %s', (ms, expected) => {
        expect(formatWarehouseTime(ms)).toBe(expected);
    });
});
