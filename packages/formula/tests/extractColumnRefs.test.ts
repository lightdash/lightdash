import { describe, expect, it } from 'vitest';
import { extractColumnRefs } from '../src/ast';
import { parse } from '../src/compiler';

describe('extractColumnRefs', () => {
    it.each([
        ['=A', ['A']],
        ['=A + B', ['A', 'B']],
        ['=IF(A > 0, B, C)', ['A', 'B', 'C']],
        ['=SUM(A)', ['A']],
        ['=COUNT(A)', ['A']],
        ['=COUNT()', []],
        ['=COUNTIF(A > 0)', ['A']],
        ['=SUMIF(A, B = "EU")', ['A', 'B']],
        ['=COUNT(DISTINCT A)', ['A']],
        ['=COUNT(DISTINCT A + B)', ['A', 'B']],
        ['=CONCAT(A, B, C)', ['A', 'B', 'C']],
        ['=CASE WHEN A > 0 THEN B ELSE C END', ['A', 'B', 'C']],
    ])('extracts refs from %s', (formula, expected) => {
        expect(extractColumnRefs(parse(formula))).toEqual(expected);
    });
});
