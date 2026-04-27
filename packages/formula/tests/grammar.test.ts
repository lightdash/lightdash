import { describe, expect, it } from 'vitest';
import { parse } from '../src/compiler';

describe('Formula Grammar', () => {
    describe('basic arithmetic', () => {
        it('parses addition', () => {
            const ast = parse('=A + B');
            expect(ast).toEqual({
                type: 'BinaryOp',
                op: '+',
                left: { type: 'ColumnRef', name: 'A' },
                right: { type: 'ColumnRef', name: 'B' },
            });
        });

        it('parses multiplication with precedence', () => {
            const ast = parse('=A + B * C');
            expect(ast).toEqual({
                type: 'BinaryOp',
                op: '+',
                left: { type: 'ColumnRef', name: 'A' },
                right: {
                    type: 'BinaryOp',
                    op: '*',
                    left: { type: 'ColumnRef', name: 'B' },
                    right: { type: 'ColumnRef', name: 'C' },
                },
            });
        });

        it('parses parentheses', () => {
            const ast = parse('=(A + B) * C');
            expect(ast).toEqual({
                type: 'BinaryOp',
                op: '*',
                left: {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'ColumnRef', name: 'A' },
                    right: { type: 'ColumnRef', name: 'B' },
                },
                right: { type: 'ColumnRef', name: 'C' },
            });
        });

        it('parses unary minus', () => {
            const ast = parse('=-A');
            expect(ast).toEqual({
                type: 'UnaryOp',
                op: '-',
                operand: { type: 'ColumnRef', name: 'A' },
            });
        });
    });

    describe('literals', () => {
        it('parses numbers', () => {
            const ast = parse('=42');
            expect(ast).toEqual({ type: 'NumberLiteral', value: 42 });
        });

        it('parses decimal numbers', () => {
            const ast = parse('=3.14');
            expect(ast).toEqual({ type: 'NumberLiteral', value: 3.14 });
        });

        it('parses double-quoted strings', () => {
            const ast = parse('="hello"');
            expect(ast).toEqual({ type: 'StringLiteral', value: 'hello' });
        });

        it('parses single-quoted strings', () => {
            const ast = parse("='hello'");
            expect(ast).toEqual({ type: 'StringLiteral', value: 'hello' });
        });

        it('parses TRUE', () => {
            const ast = parse('=TRUE');
            expect(ast).toEqual({ type: 'BooleanLiteral', value: true });
        });

        it('parses FALSE', () => {
            const ast = parse('=FALSE');
            expect(ast).toEqual({ type: 'BooleanLiteral', value: false });
        });
    });

    describe('function calls', () => {
        it('parses single-arg function', () => {
            const ast = parse('=ABS(A)');
            expect(ast).toEqual({
                type: 'SingleArgFn',
                name: 'ABS',
                arg: { type: 'ColumnRef', name: 'A' },
            });
        });

        it('parses one-or-two-arg function with two args', () => {
            const ast = parse('=ROUND(A, 2)');
            expect(ast).toEqual({
                type: 'OneOrTwoArgFn',
                name: 'ROUND',
                args: [
                    { type: 'ColumnRef', name: 'A' },
                    { type: 'NumberLiteral', value: 2 },
                ],
            });
        });

        it('parses nested function calls', () => {
            const ast = parse('=ABS(ROUND(A, 2))');
            expect(ast).toEqual({
                type: 'SingleArgFn',
                name: 'ABS',
                arg: {
                    type: 'OneOrTwoArgFn',
                    name: 'ROUND',
                    args: [
                        { type: 'ColumnRef', name: 'A' },
                        { type: 'NumberLiteral', value: 2 },
                    ],
                },
            });
        });

        it('parses case-insensitive function names', () => {
            const ast = parse('=abs(A)');
            expect(ast).toEqual({
                type: 'SingleArgFn',
                name: 'ABS',
                arg: { type: 'ColumnRef', name: 'A' },
            });
        });

        it('parses zero-arg function', () => {
            const ast = parse('=TODAY()');
            expect(ast).toEqual({
                type: 'ZeroArgFn',
                name: 'TODAY',
            });
        });

        it('parses LAST_DAY as a single-arg function', () => {
            const ast = parse('=LAST_DAY(A)');
            expect(ast).toEqual({
                type: 'SingleArgFn',
                name: 'LAST_DAY',
                arg: { type: 'ColumnRef', name: 'A' },
            });
        });

        it('parses DATE_TRUNC with a valid unit', () => {
            const ast = parse('=DATE_TRUNC("month", A)');
            expect(ast).toEqual({
                type: 'DateFn',
                name: 'DATE_TRUNC',
                unit: 'month',
                args: [{ type: 'ColumnRef', name: 'A' }],
            });
        });

        it('normalises DATE_TRUNC unit to lowercase', () => {
            const ast = parse('=DATE_TRUNC("MONTH", A)');
            expect(ast).toEqual({
                type: 'DateFn',
                name: 'DATE_TRUNC',
                unit: 'month',
                args: [{ type: 'ColumnRef', name: 'A' }],
            });
        });

        it('accepts all whitelisted DATE_TRUNC units', () => {
            for (const unit of [
                'day',
                'week',
                'month',
                'quarter',
                'year',
            ] as const) {
                const ast = parse(`=DATE_TRUNC("${unit}", A)`);
                expect(ast).toEqual({
                    type: 'DateFn',
                    name: 'DATE_TRUNC',
                    unit,
                    args: [{ type: 'ColumnRef', name: 'A' }],
                });
            }
        });

        it('rejects DATE_TRUNC with a non-whitelisted unit', () => {
            expect(() => parse('=DATE_TRUNC("second", A)')).toThrow(
                /DATE_TRUNC unit must be one of/,
            );
        });

        it('rejects DATE_TRUNC with a non-literal first argument', () => {
            expect(() => parse('=DATE_TRUNC(A, B)')).toThrow(
                /must be a string literal unit/,
            );
        });

        it('rejects DATE_TRUNC with wrong arg count', () => {
            expect(() => parse('=DATE_TRUNC(A)')).toThrow(
                /DATE_TRUNC called with wrong number of arguments/,
            );
        });

        it('parses DATE_ADD as a DateFn node', () => {
            const ast = parse('=DATE_ADD(A, 3, "month")');
            expect(ast).toEqual({
                type: 'DateFn',
                name: 'DATE_ADD',
                unit: 'month',
                args: [
                    { type: 'ColumnRef', name: 'A' },
                    { type: 'NumberLiteral', value: 3 },
                ],
            });
        });

        it('desugars DATE_SUB to DATE_ADD with negated n', () => {
            const ast = parse('=DATE_SUB(A, 3, "month")');
            expect(ast).toEqual({
                type: 'DateFn',
                name: 'DATE_ADD',
                unit: 'month',
                args: [
                    { type: 'ColumnRef', name: 'A' },
                    {
                        type: 'UnaryOp',
                        op: '-',
                        operand: { type: 'NumberLiteral', value: 3 },
                    },
                ],
            });
        });

        it('accepts all whitelisted units on DATE_ADD', () => {
            for (const unit of [
                'day',
                'week',
                'month',
                'quarter',
                'year',
            ] as const) {
                const ast = parse(`=DATE_ADD(A, 1, "${unit}")`);
                expect((ast as { unit: string }).unit).toBe(unit);
            }
        });

        it('rejects DATE_ADD with a non-whitelisted unit', () => {
            expect(() => parse('=DATE_ADD(A, 1, "decade")')).toThrow(
                /DATE_ADD unit must be one of/,
            );
        });

        it('rejects DATE_SUB with a non-literal unit', () => {
            expect(() => parse('=DATE_SUB(A, 1, B)')).toThrow(
                /DATE_SUB third argument must be a string literal unit/,
            );
        });

        it('rejects DATE_ADD with wrong arg count', () => {
            expect(() => parse('=DATE_ADD(A, 1)')).toThrow(
                /DATE_ADD called with wrong number of arguments/,
            );
        });

        it('parses variadic function', () => {
            const ast = parse('=CONCAT(A, B, C)');
            expect(ast).toEqual({
                type: 'VariadicFn',
                name: 'CONCAT',
                args: [
                    { type: 'ColumnRef', name: 'A' },
                    { type: 'ColumnRef', name: 'B' },
                    { type: 'ColumnRef', name: 'C' },
                ],
            });
        });

        it('parses zero-or-one-arg function with no args', () => {
            const ast = parse('=COUNT()');
            expect(ast).toEqual({
                type: 'ZeroOrOneArgFn',
                name: 'COUNT',
                arg: null,
            });
        });

        it('parses zero-or-one-arg function with one arg', () => {
            const ast = parse('=COUNT(A)');
            expect(ast).toEqual({
                type: 'ZeroOrOneArgFn',
                name: 'COUNT',
                arg: { type: 'ColumnRef', name: 'A' },
            });
        });
    });

    describe('comparisons', () => {
        it('parses equals', () => {
            const ast = parse('=A = B');
            expect(ast).toEqual({
                type: 'Comparison',
                op: '=',
                left: { type: 'ColumnRef', name: 'A' },
                right: { type: 'ColumnRef', name: 'B' },
            });
        });

        it('parses not equals', () => {
            const ast = parse('=A <> B');
            expect(ast).toEqual({
                type: 'Comparison',
                op: '<>',
                left: { type: 'ColumnRef', name: 'A' },
                right: { type: 'ColumnRef', name: 'B' },
            });
        });
    });

    describe('logical operators', () => {
        it('parses AND with comparisons', () => {
            const ast = parse('=A > 0 AND B > 0');
            expect(ast).toEqual({
                type: 'Logical',
                op: 'AND',
                left: {
                    type: 'Comparison',
                    op: '>',
                    left: { type: 'ColumnRef', name: 'A' },
                    right: { type: 'NumberLiteral', value: 0 },
                },
                right: {
                    type: 'Comparison',
                    op: '>',
                    left: { type: 'ColumnRef', name: 'B' },
                    right: { type: 'NumberLiteral', value: 0 },
                },
            });
        });

        it('parses NOT with comparison', () => {
            const ast = parse('=NOT A > 0');
            expect(ast).toEqual({
                type: 'UnaryOp',
                op: 'NOT',
                operand: {
                    type: 'Comparison',
                    op: '>',
                    left: { type: 'ColumnRef', name: 'A' },
                    right: { type: 'NumberLiteral', value: 0 },
                },
            });
        });

        it('parses function-call-style NOT(expr) — Excel/Sheets idiom', () => {
            const ast = parse('=NOT(A > 100)');
            expect(ast).toEqual({
                type: 'UnaryOp',
                op: 'NOT',
                operand: {
                    type: 'Comparison',
                    op: '>',
                    left: { type: 'ColumnRef', name: 'A' },
                    right: { type: 'NumberLiteral', value: 100 },
                },
            });
        });

        it('parses NOT wrapping a parenthesised boolean OR', () => {
            const ast = parse('=NOT(A > 0 OR B < 0)');
            expect(ast).toEqual({
                type: 'UnaryOp',
                op: 'NOT',
                operand: {
                    type: 'Logical',
                    op: 'OR',
                    left: {
                        type: 'Comparison',
                        op: '>',
                        left: { type: 'ColumnRef', name: 'A' },
                        right: { type: 'NumberLiteral', value: 0 },
                    },
                    right: {
                        type: 'Comparison',
                        op: '<',
                        left: { type: 'ColumnRef', name: 'B' },
                        right: { type: 'NumberLiteral', value: 0 },
                    },
                },
            });
        });

        it('rejects bare column refs in AND', () => {
            expect(() => parse('=A AND B')).toThrow();
        });

        it('rejects bare column ref in NOT', () => {
            expect(() => parse('=NOT A')).toThrow();
        });
    });

    describe('IF expression', () => {
        it('parses IF with three args', () => {
            const ast = parse('=IF(A > 0, A, B)');
            expect(ast).toEqual({
                type: 'If',
                condition: {
                    type: 'Comparison',
                    op: '>',
                    left: { type: 'ColumnRef', name: 'A' },
                    right: { type: 'NumberLiteral', value: 0 },
                },
                then: { type: 'ColumnRef', name: 'A' },
                else: { type: 'ColumnRef', name: 'B' },
            });
        });

        it('parses IF with two args (no else)', () => {
            const ast = parse('=IF(A > 0, A)');
            expect(ast).toEqual({
                type: 'If',
                condition: {
                    type: 'Comparison',
                    op: '>',
                    left: { type: 'ColumnRef', name: 'A' },
                    right: { type: 'NumberLiteral', value: 0 },
                },
                then: { type: 'ColumnRef', name: 'A' },
                else: null,
            });
        });

        it('parses case-insensitive IF', () => {
            const ast = parse('=if(A > 0, A, B)');
            expect(ast.type).toBe('If');
        });

        it('accepts boolean literal as condition', () => {
            const ast = parse('=IF(TRUE, A, B)');
            expect(ast.type).toBe('If');
        });
    });

    describe('conditional aggregates', () => {
        it('parses SUMIF', () => {
            const ast = parse('=SUMIF(A, B = "Electronics")');
            expect(ast).toEqual({
                type: 'ConditionalAggregate',
                name: 'SUMIF',
                value: { type: 'ColumnRef', name: 'A' },
                condition: {
                    type: 'Comparison',
                    op: '=',
                    left: { type: 'ColumnRef', name: 'B' },
                    right: { type: 'StringLiteral', value: 'Electronics' },
                },
            });
        });

        it('parses AVERAGEIF', () => {
            const ast = parse('=AVERAGEIF(A, B > 100)');
            expect(ast).toEqual({
                type: 'ConditionalAggregate',
                name: 'AVERAGEIF',
                value: { type: 'ColumnRef', name: 'A' },
                condition: {
                    type: 'Comparison',
                    op: '>',
                    left: { type: 'ColumnRef', name: 'B' },
                    right: { type: 'NumberLiteral', value: 100 },
                },
            });
        });

        it('parses COUNTIF', () => {
            const ast = parse('=COUNTIF(A > 100)');
            expect(ast).toEqual({
                type: 'CountIf',
                condition: {
                    type: 'Comparison',
                    op: '>',
                    left: { type: 'ColumnRef', name: 'A' },
                    right: { type: 'NumberLiteral', value: 100 },
                },
            });
        });

        it('parses case-insensitive SUMIF', () => {
            const ast = parse('=sumif(A, B > 0)');
            expect(ast.type).toBe('ConditionalAggregate');
        });

        it('accepts logical AND condition', () => {
            const ast = parse('=SUMIF(A, B > 100 AND C = "US")');
            expect(ast.type).toBe('ConditionalAggregate');
        });

        it('accepts NOT condition', () => {
            const ast = parse('=SUMIF(A, NOT B > 100)');
            expect(ast.type).toBe('ConditionalAggregate');
        });

        it('accepts ISNULL condition', () => {
            const ast = parse('=SUMIF(A, ISNULL(B))');
            expect(ast.type).toBe('ConditionalAggregate');
        });
    });

    describe('error handling', () => {
        it('rejects unknown functions', () => {
            expect(() => parse('=FOO(A)')).toThrow('Unknown function: FOO');
        });

        it('rejects SUM with wrong arity', () => {
            expect(() => parse('=SUM(A, B)')).toThrow(
                'SUM called with wrong number of arguments',
            );
        });

        it('rejects ABS with wrong arity', () => {
            expect(() => parse('=ABS(A, B)')).toThrow(
                'ABS called with wrong number of arguments',
            );
        });

        it('rejects COUNTIF with wrong arity', () => {
            expect(() => parse('=COUNTIF(A > 0, B)')).toThrow(
                'COUNTIF called with wrong number of arguments',
            );
        });

        it('rejects SUMIF with wrong arity', () => {
            expect(() => parse('=SUMIF(A)')).toThrow(
                'SUMIF called with wrong number of arguments',
            );
        });

        it('rejects IF with wrong arity', () => {
            expect(() => parse('=IF(A > 0, A, B, C)')).toThrow(
                'IF called with wrong number of arguments',
            );
        });

        it('rejects TODAY with args', () => {
            expect(() => parse('=TODAY(A)')).toThrow(
                'TODAY called with wrong number of arguments',
            );
        });
    });

    describe('rejects non-boolean in condition slots', () => {
        it('rejects SUMIF with flipped args', () => {
            expect(() => parse('=SUMIF(A > 0, B)')).toThrow(
                'SUMIF requires a condition (e.g. B > 0) as its second argument',
            );
        });

        it('rejects IF with non-boolean condition', () => {
            expect(() => parse('=IF(A, B, C)')).toThrow(
                'IF requires a condition (e.g. A > 0) as its first argument',
            );
        });

        it('rejects COUNTIF with non-boolean arg', () => {
            expect(() => parse('=COUNTIF(A)')).toThrow(
                'COUNTIF requires a condition (e.g. A > 0) as its argument',
            );
        });
    });
});
