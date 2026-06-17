import { describe, expect, it } from 'vitest';
import { hasMinQueryLength } from './useSearch';

describe('hasMinQueryLength', () => {
    it.each([
        { name: 'undefined query', query: undefined, expected: false },
        { name: 'empty query', query: '', expected: false },
        { name: 'ASCII below minimum length', query: 'ab', expected: false },
        {
            name: 'trimmed ASCII below minimum length',
            query: 'ab ',
            expected: false,
        },
        { name: 'ASCII at minimum length', query: 'abc', expected: true },
        {
            name: 'trimmed ASCII at minimum length',
            query: ' abc ',
            expected: true,
        },
        { name: 'Han character', query: '売', expected: true },
        { name: 'trimmed Han character', query: ' 売 ', expected: true },
        { name: 'Hiragana character', query: 'あ', expected: true },
        { name: 'Katakana character', query: 'カ', expected: true },
        { name: 'Hangul character', query: '한', expected: true },
        { name: 'multi-character Han query', query: '売上', expected: true },
        { name: 'mixed ASCII and CJK query', query: 'a売', expected: true },
        { name: 'whitespace-only query', query: '　 ', expected: false },
    ])('returns $expected for $name', ({ query, expected }) => {
        expect(hasMinQueryLength(query)).toBe(expected);
    });
});
