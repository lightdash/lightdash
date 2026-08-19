import { describe, expect, it } from 'vitest';
import {
    countParameters,
    expandFormats,
    inlineParameters,
    placeholderValues,
    readBindMessage,
    readCloseMessage,
    readDescribeMessage,
    readExecuteMessage,
    readParseMessage,
} from './extendedQuery';
import { cstring, int16, int32 } from './wireEncoding';

describe('extended query message decoding', () => {
    it('reads Parse with parameter type OIDs', () => {
        const payload = Buffer.concat([
            cstring('s1'),
            cstring('SELECT $1, $2'),
            int16(2),
            int32(23),
            int32(0),
        ]);
        expect(readParseMessage(payload)).toEqual({
            statementName: 's1',
            sql: 'SELECT $1, $2',
            parameterOids: [23, 0],
        });
    });

    it('reads Bind and expands a single format code to every parameter', () => {
        const payload = Buffer.concat([
            cstring('p'),
            cstring('s'),
            int16(1),
            int16(0),
            int16(3),
            int32(1),
            Buffer.from('a'),
            int32(-1),
            int32(2),
            Buffer.from('bc'),
            int16(2),
            int16(0),
            int16(1),
        ]);
        const bind = readBindMessage(payload);
        expect(bind.portalName).toBe('p');
        expect(bind.statementName).toBe('s');
        expect(bind.parameterFormats).toEqual([0, 0, 0]);
        expect(bind.parameters.map((p) => p?.toString('utf8') ?? null)).toEqual(
            ['a', null, 'bc'],
        );
        expect(bind.resultFormats).toEqual([0, 1]);
    });

    it('reads Describe, Close and Execute', () => {
        expect(
            readDescribeMessage(
                Buffer.concat([Buffer.from('S'), cstring('x')]),
            ),
        ).toEqual({ kind: 'S', name: 'x' });
        expect(
            readCloseMessage(Buffer.concat([Buffer.from('P'), cstring('')])),
        ).toEqual({ kind: 'P', name: '' });
        expect(
            readExecuteMessage(Buffer.concat([cstring('c'), int32(50)])),
        ).toEqual({ portalName: 'c', maxRows: 50 });
    });

    it('rejects mismatched format counts, unknown format codes and negative lengths with 08P01', () => {
        expect(expandFormats([], 3, 'parameter')).toEqual([0, 0, 0]);
        expect(expandFormats([1], 2, 'result column')).toEqual([1, 1]);
        expect(expandFormats([1], 0, 'result column')).toEqual([]);
        expect(expandFormats([0, 1], 2, 'parameter')).toEqual([0, 1]);
        expect(() => expandFormats([0, 1], 3, 'parameter')).toThrow(
            expect.objectContaining({ code: '08P01' }),
        );
        const bindWith = (formatCode: number, length: number): Buffer =>
            Buffer.concat([
                cstring(''),
                cstring(''),
                int16(1),
                int16(formatCode),
                int16(1),
                int32(length),
                int16(0),
            ]);
        expect(() => readBindMessage(bindWith(2, -1))).toThrow(
            expect.objectContaining({ code: '08P01' }),
        );
        expect(() => readBindMessage(bindWith(0, -2))).toThrow(
            expect.objectContaining({ code: '08P01' }),
        );
        expect(() =>
            readParseMessage(
                Buffer.concat([cstring(''), cstring('SELECT 1'), int16(-1)]),
            ),
        ).toThrow(expect.objectContaining({ code: '08P01' }));
    });

    it('rejects truncated payloads and unknown Describe kinds with 08P01', () => {
        expect(() => readExecuteMessage(cstring('c'))).toThrow(
            expect.objectContaining({ code: '08P01' }),
        );
        expect(() => readParseMessage(Buffer.from('no terminator'))).toThrow(
            expect.objectContaining({ code: '08P01' }),
        );
        expect(() =>
            readDescribeMessage(Buffer.concat([Buffer.from('X'), cstring('')])),
        ).toThrow(expect.objectContaining({ code: '08P01' }));
    });
});

describe('inlineParameters', () => {
    it('inlines text, numeric, boolean and null parameters by OID', () => {
        expect(
            inlineParameters(
                'SELECT $1, $2, $3, $4, $5',
                ["O'Brien", '42', '3.5e2', 't', null],
                [25, 23, 701, 16, 25],
            ),
        ).toBe("SELECT 'O''Brien', 42, 3.5e2, TRUE, NULL");
    });

    it('quotes numeric-typed values that are not numeric literals', () => {
        expect(inlineParameters('SELECT $1', ['12abc'], [23])).toBe(
            "SELECT '12abc'",
        );
    });

    it('quotes untyped (OID 0) numbers as text', () => {
        expect(inlineParameters('SELECT $1', ['42'], [0])).toBe("SELECT '42'");
    });

    it('leaves placeholders alone inside strings, identifiers and comments', () => {
        const sql = [
            "SELECT '$1', \"$1\", 'it''s $1' -- $1 here",
            '/* $1 there */ WHERE a = $1',
        ].join('\n');
        expect(inlineParameters(sql, ['v'], [25])).toBe(
            [
                "SELECT '$1', \"$1\", 'it''s $1' -- $1 here",
                "/* $1 there */ WHERE a = 'v'",
            ].join('\n'),
        );
    });

    it('distinguishes $10 from $1', () => {
        const values = Array.from({ length: 10 }, (_, i) => String(i + 1));
        const oids = values.map(() => 23);
        expect(inlineParameters('SELECT $10, $1', values, oids)).toBe(
            'SELECT 10, 1',
        );
    });

    it('leaves a $ glued to an identifier alone', () => {
        expect(inlineParameters('SELECT foo$1, $1', ['v'], [25])).toBe(
            "SELECT foo$1, 'v'",
        );
    });

    it('accepts every Postgres boolean spelling and rejects others with 22P02', () => {
        expect(
            inlineParameters(
                'SELECT $1, $2, $3, $4',
                ['TRUE', 'yes', 'off', ' 0 '],
                [16, 16, 16, 16],
            ),
        ).toBe('SELECT TRUE, TRUE, FALSE, FALSE');
        expect(() => inlineParameters('SELECT $1', ['maybe'], [16])).toThrow(
            expect.objectContaining({ code: '22P02' }),
        );
    });

    it('refuses to grow a statement past 1MB with 54000', () => {
        const sql = Array.from({ length: 1100 }, () => '$1').join(',');
        expect(() => inlineParameters(sql, ['x'.repeat(1000)], [25])).toThrow(
            expect.objectContaining({ code: '54000' }),
        );
        expect(
            inlineParameters('SELECT $1', ['x'.repeat(1000)], [25]),
        ).toHaveLength('SELECT '.length + 1002);
    });

    it('rejects placeholder numbers above the Postgres limit with 54023', () => {
        expect(() => countParameters('SELECT $65536')).toThrow(
            expect.objectContaining({ code: '54023' }),
        );
        expect(countParameters('SELECT $65535')).toBe(65535);
        expect(() => inlineParameters('SELECT $4000000000', [], [])).toThrow(
            expect.objectContaining({ code: '54023' }),
        );
    });

    it('rejects a placeholder without a bound value with 42P02', () => {
        expect(() => inlineParameters('SELECT $2', ['a'], [25])).toThrow(
            expect.objectContaining({ code: '42P02' }),
        );
    });

    it('produces compilable placeholder values by OID for Describe before Bind', () => {
        expect(placeholderValues([23, 16, 25, 0])).toEqual([
            '1',
            'true',
            '',
            '',
        ]);
        expect(
            inlineParameters(
                'WHERE n > $1 AND b = $2 AND s = $3 LIMIT $4',
                placeholderValues([23, 16, 25, 20]),
                [23, 16, 25, 20],
            ),
        ).toBe("WHERE n > 1 AND b = TRUE AND s = '' LIMIT 1");
    });
});

describe('countParameters', () => {
    it('returns the highest placeholder index, ignoring quoted and commented ones', () => {
        expect(countParameters('SELECT 1')).toBe(0);
        expect(countParameters('SELECT $2, $1')).toBe(2);
        expect(countParameters("SELECT '$9', $3 -- $8")).toBe(3);
    });
});
