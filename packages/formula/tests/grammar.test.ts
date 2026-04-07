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
        it('parses simple function call', () => {
            const ast = parse('=ABS(A)');
            expect(ast).toEqual({
                type: 'FunctionCall',
                name: 'ABS',
                args: [{ type: 'ColumnRef', name: 'A' }],
            });
        });

        it('parses multi-arg function', () => {
            const ast = parse('=ROUND(A, 2)');
            expect(ast).toEqual({
                type: 'FunctionCall',
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
                type: 'FunctionCall',
                name: 'ABS',
                args: [
                    {
                        type: 'FunctionCall',
                        name: 'ROUND',
                        args: [
                            { type: 'ColumnRef', name: 'A' },
                            { type: 'NumberLiteral', value: 2 },
                        ],
                    },
                ],
            });
        });

        it('parses case-insensitive function names', () => {
            const ast = parse('=abs(A)');
            expect(ast).toEqual({
                type: 'FunctionCall',
                name: 'ABS',
                args: [{ type: 'ColumnRef', name: 'A' }],
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
        it('parses AND', () => {
            const ast = parse('=A AND B');
            expect(ast).toEqual({
                type: 'Logical',
                op: 'AND',
                left: { type: 'ColumnRef', name: 'A' },
                right: { type: 'ColumnRef', name: 'B' },
            });
        });

        it('parses NOT', () => {
            const ast = parse('=NOT A');
            expect(ast).toEqual({
                type: 'UnaryOp',
                op: 'NOT',
                operand: { type: 'ColumnRef', name: 'A' },
            });
        });
    });

    describe('IF function', () => {
        it('parses IF with three args', () => {
            const ast = parse('=IF(A > 0, A, B)');
            expect(ast).toEqual({
                type: 'FunctionCall',
                name: 'IF',
                args: [
                    {
                        type: 'Comparison',
                        op: '>',
                        left: { type: 'ColumnRef', name: 'A' },
                        right: { type: 'NumberLiteral', value: 0 },
                    },
                    { type: 'ColumnRef', name: 'A' },
                    { type: 'ColumnRef', name: 'B' },
                ],
            });
        });
    });
});
