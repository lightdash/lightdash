import { describe, expect, test } from 'vitest';
import { formatCacheDuration } from './formatCacheDuration';

describe('formatCacheDuration', () => {
    test.each([
        [60, '1 minute'],
        [45 * 60, '45 minutes'],
        [3600, '1 hour'],
        [90 * 60, '1.5 hours'],
        [24 * 3600, '24 hours'],
        [3 * 86400, '3 days'],
        [7 * 86400, '7 days'],
    ])('%d seconds is %s', (seconds, expected) => {
        expect(formatCacheDuration(seconds)).toBe(expected);
    });
});
