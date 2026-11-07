import { getResultsCacheExpiryBufferMs } from './expiryBuffer';

describe('getResultsCacheExpiryBufferMs', () => {
    test('uses 10 minutes for TTLs longer than 40 minutes', () => {
        expect(getResultsCacheExpiryBufferMs(24 * 60 * 60 * 1000)).toBe(
            10 * 60 * 1000,
        );
    });
    test('uses a quarter of short TTLs', () => {
        expect(getResultsCacheExpiryBufferMs(20 * 60 * 1000)).toBe(
            5 * 60 * 1000,
        );
    });
    test('uses a quarter at exactly 40 minutes', () => {
        expect(getResultsCacheExpiryBufferMs(40 * 60 * 1000)).toBe(
            10 * 60 * 1000,
        );
    });
});
