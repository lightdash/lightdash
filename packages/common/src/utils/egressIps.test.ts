import { describe, expect, it } from 'vitest';
import { parseEgressIps } from './egressIps';

describe('parseEgressIps', () => {
    it('splits a configured list and ignores an empty value', () => {
        expect(parseEgressIps('35.1.1.1, 35.2.2.2 35.3.3.3')).toEqual([
            '35.1.1.1',
            '35.2.2.2',
            '35.3.3.3',
        ]);
        expect(parseEgressIps('')).toEqual([]);
        expect(parseEgressIps(undefined)).toEqual([]);
    });
});
