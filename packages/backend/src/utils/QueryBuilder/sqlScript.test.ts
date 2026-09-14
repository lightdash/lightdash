import { parseSqlScript, splitSqlStatements } from './sqlScript';

describe('splitSqlStatements', () => {
    test('returns a single statement unchanged', () => {
        expect(splitSqlStatements('SELECT 1')).toEqual(['SELECT 1']);
    });

    test('ignores empty statements from trailing semicolons', () => {
        expect(splitSqlStatements('SELECT 1;; \n\t;')).toEqual(['SELECT 1']);
    });

    test('splits statements at top-level semicolons', () => {
        expect(
            splitSqlStatements('DECLARE x INT64 DEFAULT 30;\nSELECT x'),
        ).toEqual(['DECLARE x INT64 DEFAULT 30', 'SELECT x']);
    });

    test('ignores semicolons inside strings and quoted identifiers', () => {
        expect(splitSqlStatements(`SELECT ';' AS "a;b", \`c;d\``)).toEqual([
            `SELECT ';' AS "a;b", \`c;d\``,
        ]);
    });

    test('ignores semicolons inside escaped and doubled quotes', () => {
        expect(splitSqlStatements("SELECT 'it''s; fine', 'a\\'; b'")).toEqual([
            "SELECT 'it''s; fine', 'a\\'; b'",
        ]);
    });

    test('ignores semicolons inside triple-quoted strings', () => {
        expect(splitSqlStatements(`SELECT '''a;'' b''' AS x`)).toEqual([
            `SELECT '''a;'' b''' AS x`,
        ]);
    });

    test('ignores semicolons inside comments', () => {
        const sql = 'SELECT 1 -- a; comment\n, 2 # another; one\n, /* a;b */ 3';

        expect(splitSqlStatements(sql)).toEqual([sql]);
    });
});

describe('parseSqlScript', () => {
    test('leaves a single statement alone', () => {
        expect(parseSqlScript('SELECT 1;')).toEqual({
            kind: 'statement',
            sql: 'SELECT 1;',
        });
    });

    test('hoists leading DECLARE and SET statements', () => {
        const sql = [
            'DECLARE lookback_days INT64 DEFAULT 30;',
            'SET lookback_days = 60;',
            'SELECT * FROM events WHERE days > lookback_days;',
        ].join('\n');

        expect(parseSqlScript(sql)).toEqual({
            kind: 'hoistable',
            prelude:
                'DECLARE lookback_days INT64 DEFAULT 30;\nSET lookback_days = 60;',
            sql: 'SELECT * FROM events WHERE days > lookback_days',
        });
    });

    test.each([
        {
            name: 'tuple assignment without whitespace after SET',
            sql: 'SET(x, y) = (1, 2);\nSELECT x, y;',
            expectedPrelude: 'SET(x, y) = (1, 2);',
            expectedSql: 'SELECT x, y',
        },
        {
            name: 'a comment immediately after DECLARE',
            sql: 'DECLARE/* type note */ x INT64 DEFAULT 1;\nSELECT x;',
            expectedPrelude: 'DECLARE/* type note */ x INT64 DEFAULT 1;',
            expectedSql: 'SELECT x',
        },
    ])('recognizes $name', ({ sql, expectedPrelude, expectedSql }) => {
        expect(parseSqlScript(sql)).toEqual({
            kind: 'hoistable',
            prelude: expectedPrelude,
            sql: expectedSql,
        });
    });

    test.each([
        {
            name: 'before the first declaration',
            sql: '-- setup\nDECLARE x INT64 DEFAULT 1;\nSELECT x;',
            expectedPrelude: '-- setup\nDECLARE x INT64 DEFAULT 1;',
            expectedSql: 'SELECT x',
        },
        {
            name: 'between scripting statements',
            sql: 'DECLARE x INT64 DEFAULT 1;\n-- update\nSET x = 2;\nSELECT x;',
            expectedPrelude:
                'DECLARE x INT64 DEFAULT 1;\n-- update\nSET x = 2;',
            expectedSql: 'SELECT x',
        },
        {
            name: 'after the final query',
            sql: 'DECLARE x INT64 DEFAULT 1;\nSELECT x;\n-- done',
            expectedPrelude: 'DECLARE x INT64 DEFAULT 1;',
            expectedSql: 'SELECT x\n-- done',
        },
    ])('preserves comments $name', ({ sql, expectedPrelude, expectedSql }) => {
        expect(parseSqlScript(sql)).toEqual({
            kind: 'hoistable',
            prelude: expectedPrelude,
            sql: expectedSql,
        });
    });

    test('reports a script with a leading statement that cannot be hoisted', () => {
        const sql = [
            'DECLARE x INT64 DEFAULT 1;',
            'CREATE TEMP TABLE t AS SELECT 1 AS a;',
            'SELECT * FROM t;',
        ].join('\n');

        expect(parseSqlScript(sql)).toEqual({ kind: 'unhoistable' });
    });

    test('leaves scripts that do not start with a hoistable statement alone', () => {
        const sql = 'CREATE TEMP TABLE t AS SELECT 1 AS a;\nSELECT * FROM t;';

        expect(parseSqlScript(sql)).toEqual({ kind: 'statement', sql });
    });

    test('does not treat a column named set as a scripting statement', () => {
        expect(parseSqlScript('SELECT setting FROM a;\nSELECT 1')).toEqual({
            kind: 'statement',
            sql: 'SELECT setting FROM a;\nSELECT 1',
        });
    });
});
