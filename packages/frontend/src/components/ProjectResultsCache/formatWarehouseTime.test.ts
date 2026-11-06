import { describe, expect, test } from 'vitest';
import { formatWarehouseTime } from './formatWarehouseTime';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatWarehouseTime', () => {
    test.each([
        [0, '0ms'],
        [999, '999ms'],
        [1000, '1s'],
        [12_400, '~12s'],
        [MINUTE, '1m'],
        [2 * MINUTE + 40 * SECOND, '~3m'],
        [HOUR, '1h'],
        [11 * HOUR + 18 * MINUTE, '~11h'],
        [47 * HOUR + 59 * MINUTE, '~2d'],
        [2 * DAY, '2d'],
        [52 * DAY + 2 * HOUR, '~52d'],
        [999.6, '~1s'],
        [59_600, '~1m'],
        [59 * MINUTE + 36 * SECOND, '~1h'],
        [47 * HOUR + 36 * MINUTE, '~2d'],
    ])('%d ms -> %s', (ms, expected) => {
        expect(formatWarehouseTime(ms)).toBe(expected);
    });
});
