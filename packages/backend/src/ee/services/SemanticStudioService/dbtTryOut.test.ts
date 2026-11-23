import { describe, expect, it } from 'vitest';
import { dbtChangeFingerprint } from './dbtTryOut';

describe('dbtChangeFingerprint', () => {
    const a = { path: 'models/a.yml', base: 'a: 1', next: 'a: 2' };
    const b = { path: 'models/b.yml', base: null, next: 'b: 1' };
    const fingerprint = dbtChangeFingerprint('sha', [a, b], null);

    it('ignores the order files are listed in and files left as they were', () => {
        expect(
            dbtChangeFingerprint(
                'sha',
                [b, { path: 'models/c.yml', base: 'c', next: 'c' }, a],
                null,
            ),
        ).toBe(fingerprint);
    });

    it.each([
        [
            'another compiled commit',
            dbtChangeFingerprint('other', [a, b], null),
        ],
        [
            'other content',
            dbtChangeFingerprint('sha', [a, { ...b, next: 'b: 2' }], null),
        ],
        [
            'a deleted file',
            dbtChangeFingerprint('sha', [a, { ...b, next: null }], null),
        ],
        ['a missing file', dbtChangeFingerprint('sha', [a], null)],
        ['another project config', dbtChangeFingerprint('sha', [a, b], 'x: 1')],
    ])('differs for %s', (_label, other) => {
        expect(other).not.toBe(fingerprint);
    });
});
