import { describe, expect, it } from 'vitest';
import { getAdjustedCronByOffset } from './cronUtils';

describe('getAdjustedCronByOffset', () => {
    it('adjusts the time without changing the days', () => {
        expect(getAdjustedCronByOffset('0 9 * * 1-5', 120)).toEqual(
            '0 11 * * 1-5',
        );
    });

    it('shifts every day of the week when the hour overflows into the next day', () => {
        expect(getAdjustedCronByOffset('0 23 * * 1-5', 120)).toEqual(
            '0 1 * * 2-6',
        );
    });

    it('shifts every day of the week when the hour overflows into the previous day', () => {
        expect(getAdjustedCronByOffset('0 0 * * 1-5', -120)).toEqual(
            '0 22 * * 0-4',
        );
    });

    it('adjusts a single day of the week', () => {
        expect(getAdjustedCronByOffset('0 23 * * 1', 120)).toEqual('0 1 * * 2');
    });
});
