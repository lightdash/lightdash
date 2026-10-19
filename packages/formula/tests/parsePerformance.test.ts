import { describe, expect, it } from 'vitest';
import { parse } from '../src/compiler';

// Regression guard for exponential backtracking in the grammar. Without
// memoization, a rule that fully parses a sub-expression and then fails (e.g.
// `Expression = BooleanOr / Arithmetic`, where `Comparison` consumes a whole
// nested IF before failing on the missing comparison operator) re-parses that
// sub-expression on the next alternative, so parse time multiplies with every
// nesting level. A 24-deep nested IF took ~5 minutes and blocked the backend
// event loop until Kubernetes killed the pod (PROD-12387).
//
// Parsing is synchronous, so a regression cannot be interrupted by the test
// timeout. Each depth is chosen so the backtracking grammar takes seconds (and
// fails the assertion) rather than hanging CI, while the memoized grammar
// finishes in a few milliseconds.
const MAX_PARSE_MS = 250;

const nest = (
    depth: number,
    wrap: (inner: string, level: number) => string,
    leaf: string,
) =>
    Array.from({ length: depth }, (_, i) => depth - 1 - i).reduce(
        (inner, level) => wrap(inner, level),
        leaf,
    );

const timeParse = (formula: string) => {
    const start = performance.now();
    parse(formula);
    return performance.now() - start;
};

describe('parse performance', () => {
    it.each([
        // ~2x per level when backtracking
        ['IF in else branch', nest(18, (s, i) => `IF(A = ${i}, "${i}", ${s})`, '""')],
        ['IF in then branch', nest(18, (s, i) => `IF(A = ${i}, ${s}, "${i}")`, '""')],
        ['CASE in ELSE', nest(18, (s, i) => `CASE WHEN A = ${i} THEN "${i}" ELSE ${s} END`, '""')],
        ['single-arg function', nest(18, (s) => `ABS(${s})`, 'A')],
        ['variadic function', nest(18, (s) => `COALESCE(${s}, 0)`, 'A')],
        // ~2.6x per level when backtracking
        ['parentheses', nest(14, (s) => `(${s} + 1)`, 'A')],
        // ~4x per level when backtracking (WindowedAggregate re-parses too)
        ['aggregate', nest(10, (s) => `SUM(${s})`, 'A')],
    ])('parses deeply nested %s in linear time', (_, body) => {
        expect(timeParse(`=${body}`)).toBeLessThan(MAX_PARSE_MS);
    });

    it('parses the 24-level hour label formula from PROD-12387', () => {
        const labels = Array.from(
            { length: 24 },
            (_, h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`,
        );
        const formula = `=${nest(
            24,
            (s, h) => `IF(calls_hoop_hour = ${h}, "${labels[h]}", ${s})`,
            '""',
        )}`;
        expect(timeParse(formula)).toBeLessThan(MAX_PARSE_MS);
    });
});
