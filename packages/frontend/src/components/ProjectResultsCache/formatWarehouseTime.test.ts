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
        [59_999, '59s'],
        [MINUTE, '1m'],
        [2 * MINUTE + 5 * SECOND, '2m 5s'],
        [HOUR - 1, '59m 59s'],
        [HOUR, '1h'],
        [11 * HOUR + 18 * MINUTE + 30 * SECOND, '11h 18m'],
        [47 * HOUR + 59 * MINUTE, '47h 59m'],
        [2 * DAY, '2d'],
        [52 * DAY + 2 * HOUR + 40 * MINUTE, '52d 2h'],
    ])('%d ms -> %s', (ms, expected) => {
        expect(formatWarehouseTime(ms)).toBe(expected);
    });
});
