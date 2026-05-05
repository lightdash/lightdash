import { describe, expect, it } from 'vitest';
import { isAggregateCall } from '../src/ast';
import { parse } from '../src/compiler';

describe('isAggregateCall', () => {
    it.each([
        ['=SUM(A)', true, 'SUM'],
        ['=AVG(A)', true, 'AVG'],
        ['=AVERAGE(A)', true, 'AVERAGE (alias of AVG)'],
        ['=COUNT(A)', true, 'COUNT with arg'],
        ['=COUNT()', true, 'COUNT(*)'],
        ['=MIN(A)', true, '1-arg MIN'],
        ['=MAX(A)', true, '1-arg MAX'],
        ['=SUMIF(A, B > 0)', true, 'SUMIF'],
        ['=AVERAGEIF(A, B > 0)', true, 'AVERAGEIF'],
        ['=COUNTIF(B > 0)', true, 'COUNTIF'],
        ['=COUNT(DISTINCT A)', true, 'COUNT(DISTINCT)'],
    ])('recognises %s as aggregate (%s)', (formula, expected, _desc) => {
        expect(isAggregateCall(parse(formula))).toBe(expected);
    });

    it.each([
        ['=A + B', 'binary arithmetic'],
        ['=-A', 'unary minus'],
        ['=A > 0', 'comparison'],
        ['=A > 0 AND B > 0', 'logical AND'],
        ['=IF(A > 0, A, 0)', 'IF expression'],
        ['=ABS(A)', 'scalar single-arg ABS'],
        ['=ROUND(A, 2)', '2-arg ROUND'],
        ['=MIN(A, B)', '2-arg MIN (scalar LEAST)'],
        ['=MAX(A, B)', '2-arg MAX (scalar GREATEST)'],
        ['=CONCAT(A, B)', 'variadic CONCAT'],
        ['=COALESCE(A, B)', 'variadic COALESCE'],
        ['=LEFT(A, 5)', 'two-arg LEFT'],
        ['=RIGHT(A, 5)', 'two-arg RIGHT'],
        ['=REPLACE(A, "x", "y")', 'three-arg REPLACE'],
        ['=SUBSTRING(A, 1, 5)', 'three-arg SUBSTRING'],
        ['=TODAY()', 'zero-arg TODAY'],
        ['=ROW_NUMBER()', 'window ROW_NUMBER (native windowing, not an aggregate call)'],
        ['=RUNNING_TOTAL(A)', 'window RUNNING_TOTAL (emits its own OVER)'],
        ['=LAG(A, 1)', 'window LAG'],
        ['=SUM(A) OVER (PARTITION BY B)', 'windowed SUM (carries its own OVER)'],
        ['=COUNT(DISTINCT A) OVER (PARTITION BY B)', 'windowed COUNT(DISTINCT)'],
        ['=SUMIF(A, B > 0) OVER (PARTITION BY C)', 'windowed SUMIF'],
        ['=AVG(A) OVER ()', 'windowed AVG with empty OVER'],
        ['=A', 'column reference'],
        ['=42', 'number literal'],
        ['="hello"', 'string literal'],
        ['=TRUE', 'boolean literal'],
    ])('does NOT recognise %s as aggregate (%s)', (formula, _desc) => {
        expect(isAggregateCall(parse(formula))).toBe(false);
    });
});
