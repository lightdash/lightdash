import { describe, expect, it } from 'vitest';
import { keepIfEqual } from './inputSelectors';

describe('keepIfEqual', () => {
    it('returns the stored reference when the derived value is deeply equal', () => {
        const stored = { columns: { a: { name: 'A' } }, order: ['a'] };
        const derived = { columns: { a: { name: 'A' } }, order: ['a'] };
        expect(keepIfEqual(stored, derived)).toBe(stored);
    });

    it('returns the derived reference when the value differs', () => {
        const stored = { columns: { a: { name: 'A' } }, order: ['a'] };
        const derived = { columns: { a: { name: 'B' } }, order: ['a'] };
        expect(keepIfEqual(stored, derived)).toBe(derived);
    });
});
