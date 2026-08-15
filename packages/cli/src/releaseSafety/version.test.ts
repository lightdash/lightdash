import { describe, expect, it } from 'vitest';
import { compareVersions } from './version';

describe('compareVersions', () => {
    it('throws on malformed left input', () => {
        expect(() => compareVersions('1.2', '1.2.3')).toThrowError(
            'Invalid release version value(s): left=1.2',
        );
    });

    it('throws on malformed right input', () => {
        expect(() => compareVersions('1.2.3', 'bad-right')).toThrowError(
            'Invalid release version value(s): right=bad-right',
        );
    });

    it('throws on malformed both inputs', () => {
        expect(() => compareVersions('left', 'right')).toThrowError(
            'Invalid release version value(s): left=left, right=right',
        );
    });

    it.each([
        ['1.2.3', '2.0.0', -1],
        ['1.2.3', '1.2.3', 0],
        ['2.0.0', '1.2.3', 1],
    ])('compares %s and %s as %s', (left, right, expected) => {
        expect(compareVersions(left, right)).toBe(expected);
    });
});
