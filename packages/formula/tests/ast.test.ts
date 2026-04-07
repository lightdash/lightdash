import { describe, expect, it } from 'vitest';
import { compile } from '../src';

describe('SQL Code Generation', () => {
    const columns = { A: 'order_amount', B: 'tax', C: 'category' };

    describe('arithmetic', () => {
        it('compiles addition', () => {
            const sql = compile('=A + B', { dialect: 'postgres', columns });
            expect(sql).toBe('("order_amount" + "tax")');
        });

        it('compiles safe division', () => {
            const sql = compile('=A / B', { dialect: 'postgres', columns });
            expect(sql).toBe('("order_amount" / NULLIF("tax", 0))');
        });

        it('compiles power', () => {
            const sql = compile('=A ^ 2', { dialect: 'postgres', columns });
            expect(sql).toBe('POWER("order_amount", 2)');
        });

        it('compiles modulo for postgres', () => {
            const sql = compile('=A % B', { dialect: 'postgres', columns });
            expect(sql).toBe('("order_amount" % "tax")');
        });

        it('compiles modulo for bigquery', () => {
            const sql = compile('=A % B', { dialect: 'bigquery', columns });
            expect(sql).toBe('MOD(`order_amount`, `tax`)');
        });
    });

    describe('functions', () => {
        it('compiles IF to CASE', () => {
            const sql = compile('=IF(A > 0, A, B)', { dialect: 'postgres', columns });
            expect(sql).toBe(
                'CASE WHEN ("order_amount" > 0) THEN "order_amount" ELSE "tax" END',
            );
        });

        it('compiles COALESCE', () => {
            const sql = compile('=COALESCE(A, B)', { dialect: 'postgres', columns });
            expect(sql).toBe('COALESCE("order_amount", "tax")');
        });
    });

    describe('dialect differences', () => {
        it('uses backtick quoting for BigQuery', () => {
            const sql = compile('=A + B', { dialect: 'bigquery', columns });
            expect(sql).toBe('(`order_amount` + `tax`)');
        });

        it('uses double-quote for Snowflake', () => {
            const sql = compile('=A + B', { dialect: 'snowflake', columns });
            expect(sql).toBe('("order_amount" + "tax")');
        });

        it('uses double-quote for DuckDB', () => {
            const sql = compile('=A + B', { dialect: 'duckdb', columns });
            expect(sql).toBe('("order_amount" + "tax")');
        });
    });
});
