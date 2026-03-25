import { describe, it, expect } from 'vitest';
import { extractHashToken } from '../hashToken';

describe('extractHashToken', () => {
    it('extracts token from hash fragment', () => {
        expect(extractHashToken('#token=abc.def.ghi')).toBe('abc.def.ghi');
    });

    it('returns null when hash is empty', () => {
        expect(extractHashToken('')).toBeNull();
    });

    it('returns null when hash has no token param', () => {
        expect(extractHashToken('#other=value')).toBeNull();
    });

    it('handles URL-encoded token', () => {
        expect(extractHashToken('#token=abc%2Edef%2Eghi')).toBe('abc.def.ghi');
    });

    it('extracts token when other params present', () => {
        expect(extractHashToken('#foo=bar&token=abc.def.ghi&baz=qux')).toBe(
            'abc.def.ghi',
        );
    });
});
