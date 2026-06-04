import { describe, expect, it } from 'vitest';
import { containsAggregateOrWindow } from '../src/ast';
import { parse } from '../src/compiler';

describe('containsAggregateOrWindow', () => {
    it.each([
        ['=A', false],
        ['=100 * A / B', false],
        ['=A + B - C', false],
        ['=IF(A > 0, B, C)', false],
        ['=ABS(A - B)', false],
        ['=SUM(A)', true],
        ['=SUM(A) / SUM(B)', true],
        ['=COUNT(A)', true],
        ['=COUNTIF(A > 0)', true],
        ['=COUNT(DISTINCT A)', true],
        ['=SUMIF(A, B = "EU")', true],
        ['=SUM(A) OVER (PARTITION BY B)', true],
        ['=AVG(A) OVER (ORDER BY B DESC)', true],
        ['=SUM(A) OVER ()', true],
    ])('%s -> %s', (formula, expected) => {
        expect(containsAggregateOrWindow(parse(formula))).toBe(expected);
    });
});
