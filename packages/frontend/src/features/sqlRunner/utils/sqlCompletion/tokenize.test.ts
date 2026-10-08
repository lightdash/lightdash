import { describe, expect, it } from 'vitest';
import { tokenizeSql } from './tokenize';

const types = (sql: string, quoteChar = '"') =>
    tokenizeSql(sql, quoteChar).map((t) => [t.type, t.value]);

describe('tokenizeSql', () => {
    it('splits words, punctuation and operators', () => {
        expect(types('SELECT a.b, 1.5 FROM t;')).toEqual([
            ['word', 'SELECT'],
            ['word', 'a'],
            ['dot', '.'],
            ['word', 'b'],
            ['comma', ','],
            ['number', '1.5'],
            ['word', 'FROM'],
            ['word', 't'],
            ['semicolon', ';'],
        ]);
    });

    it('reads comments, strings and parameters as single tokens', () => {
        expect(
            types("-- a, b\nSELECT 'it''s' /* x */ ${ld.parameters.r}"),
        ).toEqual([
            ['comment', '-- a, b'],
            ['word', 'SELECT'],
            ['string', "'it''s'"],
            ['comment', '/* x */'],
            ['parameter', '${ld.parameters.r}'],
        ]);
    });

    it('treats an empty string or quote pair as closed', () => {
        expect(types("WHERE a = '' AND b")).toEqual([
            ['word', 'WHERE'],
            ['word', 'a'],
            ['operator', '='],
            ['string', "''"],
            ['word', 'AND'],
            ['word', 'b'],
        ]);
        expect(tokenizeSql('FROM ``', '`')[1]).toMatchObject({
            type: 'quoted',
            closed: true,
        });
    });

    it('marks unterminated tokens as open', () => {
        expect(tokenizeSql("WHERE a = 'ab", '"')[3]).toMatchObject({
            type: 'string',
            closed: false,
        });
        expect(tokenizeSql('FROM `silver.or', '`')[1]).toMatchObject({
            type: 'quoted',
            closed: false,
        });
    });

    it('reads double quotes as strings in backtick dialects', () => {
        expect(types('WHERE a = "x"', '`')[3]).toEqual(['string', '"x"']);
        expect(types('WHERE "a" = 1', '"')[1]).toEqual(['quoted', '"a"']);
    });
});
