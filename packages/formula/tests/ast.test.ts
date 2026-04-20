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
            expect(sql).toBe(
                'MOD(CAST(`order_amount` AS NUMERIC), CAST(`tax` AS NUMERIC))',
            );
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

    describe('conditional aggregates', () => {
        it('compiles SUMIF', () => {
            const sql = compile('=SUMIF(A, B > 100)', { dialect: 'postgres', columns });
            expect(sql).toBe(
                'SUM(CASE WHEN ("tax" > 100) THEN "order_amount" END)',
            );
        });

        it('compiles AVERAGEIF', () => {
            const sql = compile('=AVERAGEIF(A, C = "Electronics")', { dialect: 'postgres', columns });
            expect(sql).toBe(
                'AVG(CASE WHEN ("category" = \'Electronics\') THEN "order_amount" END)',
            );
        });

        it('compiles COUNTIF', () => {
            const sql = compile('=COUNTIF(A > 100)', { dialect: 'postgres', columns });
            expect(sql).toBe(
                'COUNT(CASE WHEN ("order_amount" > 100) THEN 1 END)',
            );
        });

        it('compiles IF without else', () => {
            const sql = compile('=IF(A > 0, A)', { dialect: 'postgres', columns });
            expect(sql).toBe(
                'CASE WHEN ("order_amount" > 0) THEN "order_amount" ELSE NULL END',
            );
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

        it('uses double-quote for Redshift', () => {
            const sql = compile('=A + B', { dialect: 'redshift', columns });
            expect(sql).toBe('("order_amount" + "tax")');
        });

        it('uses `%` modulo for Redshift (Postgres-compatible)', () => {
            const sql = compile('=A % B', { dialect: 'redshift', columns });
            expect(sql).toBe('("order_amount" % "tax")');
        });

        it('uses backtick quoting for Databricks', () => {
            const sql = compile('=A + B', { dialect: 'databricks', columns });
            expect(sql).toBe('(`order_amount` + `tax`)');
        });

        it('uses MOD() for Databricks modulo', () => {
            const sql = compile('=A % B', { dialect: 'databricks', columns });
            expect(sql).toBe('MOD(`order_amount`, `tax`)');
        });

        it('uses backslash string escaping for Databricks', () => {
            const sql = compile(`=IF(C = "O'Brien", 1, 0)`, {
                dialect: 'databricks',
                columns,
            });
            expect(sql).toBe(
                `CASE WHEN (\`category\` = 'O\\'Brien') THEN 1 ELSE 0 END`,
            );
        });
    });
});
