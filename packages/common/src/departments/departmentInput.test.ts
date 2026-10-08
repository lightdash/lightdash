import { describe, expect, it } from 'vitest';
import {
    hasControlCharacter,
    normalizeDepartmentName,
    truncateForMessage,
} from './departmentInput';

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
    ])('finds %s', (_label, value) => {
        expect(hasControlCharacter(value)).toBe(true);
    });
    it('accepts ordinary text, spaces and accents', () => {
        expect(hasControlCharacter('Supply chain, Caf\u00E9 ✓')).toBe(false);
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
