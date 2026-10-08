import { describe, expect, it } from 'vitest';
import {
    hasControlCharacter,
    normalizeDepartmentName,
    truncateForMessage,
} from './departmentInput';

const range = (from: number, to: number): number[] =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
// Every character a name loses: zero-width, bidi controls, soft hyphen, grapheme joiner, variation selectors, tags
const INVISIBLE = [
    ...range(0x200b, 0x200d),
    0x2060,
    0xfeff,
    0x200e,
    0x200f,
    ...range(0x202a, 0x202e),
    ...range(0x2066, 0x2069),
    0x00ad,
    0x034f,
    ...range(0xfe00, 0xfe0f),
    ...range(0xe0000, 0xe007f),
];
const label = (codePoint: number): string =>
    `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;

describe('normalizeDepartmentName', () => {
    it.each([
        ['full-width letters', 'Ｆｉｎａｎｃｅ', 'Finance'],
        ['a zero-width space inside', 'Fin\u200Bance', 'Finance'],
        [
            'every zero-width character',
            '\u200BA\u200Cl\u200Dp\u2060h\uFEFFa',
            'Alpha',
        ],
        ['surrounding whitespace', '  Finance  ', 'Finance'],
        ['runs of inner whitespace', 'Supply \u00A0  chain', 'Supply chain'],
        ['a decomposed accent', 'Cafe\u0301', 'Caf\u00E9'],
        ['only zero-width characters', '\u200B\u200B', ''],
        ...INVISIBLE.map((codePoint) => [
            `${label(codePoint)} inside a name`,
            `Al${String.fromCodePoint(codePoint)}pha`,
            'Alpha',
        ]),
        ['only invisible characters', String.fromCodePoint(...INVISIBLE), ''],
        [
            'an accent kept from its letter by a grapheme joiner',
            'Cafe\u034F\u0301',
            'Caf\u00E9',
        ],
        [
            'a name wrapped in a right-to-left override',
            '\u202EAlpha\u202C',
            'Alpha',
        ],
    ])('normalises %s', (_label, input, expected) => {
        expect(normalizeDepartmentName(input)).toBe(expected);
    });
    it('makes look-alike names compare equal', () => {
        expect(normalizeDepartmentName('Alpha\u200B')).toBe(
            normalizeDepartmentName('Alpha'),
        );
        expect(normalizeDepartmentName('Cafe\u0301')).toBe(
            normalizeDepartmentName('Caf\u00E9'),
        );
    });
});

describe('hasControlCharacter', () => {
    it.each([
        ['NUL', 'Fin\u0000ance'],
        ['a tab', 'Fin\tance'],
        ['a line break', 'Fin\nance'],
        ['U+001F', 'Fin\u001Fance'],
        ['DEL', 'Fin\u007Fance'],
        ['U+0080', 'Fin\u0080ance'],
        ['a next-line character (U+0085)', 'Fin\u0085ance'],
        ['U+009F', 'Fin\u009Fance'],
    ])('finds %s', (_label, value) => {
        expect(hasControlCharacter(value)).toBe(true);
    });
    it('accepts ordinary text, spaces and accents', () => {
        expect(hasControlCharacter('Supply chain, Caf\u00E9 ✓')).toBe(false);
        // The first character after the C1 controls
        expect(hasControlCharacter('No\u00A0break')).toBe(false);
    });
});

describe('truncateForMessage', () => {
    it('leaves 80 characters or fewer as they are', () => {
        expect(truncateForMessage('x'.repeat(80))).toBe('x'.repeat(80));
    });
    it('cuts anything longer to 80 characters and an ellipsis', () => {
        expect(truncateForMessage('x'.repeat(4_000_000))).toBe(
            `${'x'.repeat(80)}…`,
        );
    });
    it('prints values that are not strings', () => {
        expect(truncateForMessage(42)).toBe('42');
        expect(truncateForMessage(undefined)).toBe('undefined');
    });
});
