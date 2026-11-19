import { describe, expect, it } from 'vitest';
import { COLLAPSE_CODE_AFTER_LINES, isLongCode } from './codeCollapse';

const lines = (count: number) =>
    Array.from({ length: count }, (_, i) => `line ${i}`).join('\n');

describe('isLongCode', () => {
    it('keeps queries up to the threshold expanded', () => {
        expect(isLongCode('select 1')).toBe(false);
        expect(isLongCode(lines(COLLAPSE_CODE_AFTER_LINES))).toBe(false);
    });

    it('collapses queries past the threshold', () => {
        expect(isLongCode(lines(COLLAPSE_CODE_AFTER_LINES + 1))).toBe(true);
    });

    it('ignores surrounding blank lines', () => {
        expect(
            isLongCode(`\n\n${lines(COLLAPSE_CODE_AFTER_LINES)}\n\n\n`),
        ).toBe(false);
    });
});
