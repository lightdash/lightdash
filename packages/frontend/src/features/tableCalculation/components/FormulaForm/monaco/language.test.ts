import { FUNCTION_DEFINITIONS } from '@lightdash/formula';
import { describe, expect, it } from 'vitest';
import { FORMULA_LANGUAGE_ID, formulaLanguage } from './language';

describe('lightdashFormula Monaco language', () => {
    it('exposes a stable language id', () => {
        expect(FORMULA_LANGUAGE_ID).toBe('lightdashFormula');
    });

    it('matches identifiers case-insensitively', () => {
        expect(formulaLanguage.ignoreCase).toBe(true);
    });

    it('includes every FUNCTION_DEFINITIONS name as a keyword', () => {
        const keywords = formulaLanguage.keywords as string[];
        for (const fn of FUNCTION_DEFINITIONS) {
            expect(keywords).toContain(fn.name);
        }
    });

    it('includes grammar keywords (booleans, logical ops, window clauses)', () => {
        const keywords = formulaLanguage.keywords as string[];
        for (const k of [
            'AND',
            'OR',
            'NOT',
            'TRUE',
            'FALSE',
            'ORDER',
            'BY',
            'PARTITION',
            'ASC',
            'DESC',
        ]) {
            expect(keywords).toContain(k);
        }
    });
});
