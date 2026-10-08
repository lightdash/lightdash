import {
    getPatchedSql,
    getSqlApprovalSql,
    getSqlChartPatchSqlErrors,
    isSqlApprovalToolCall,
} from './sqlApprovalToolCalls';

describe('isSqlApprovalToolCall', () => {
    it('gates raw SQL tools and SQL chart saves only', () => {
        expect(isSqlApprovalToolCall('runSql', { sql: 'select 1' })).toBe(true);
        expect(isSqlApprovalToolCall('runComposerQueries', {})).toBe(true);
        expect(
            isSqlApprovalToolCall('createContent', { type: 'sql_chart' }),
        ).toBe(true);
        expect(isSqlApprovalToolCall('createContent', { type: 'chart' })).toBe(
            false,
        );
        expect(
            isSqlApprovalToolCall('readContent', { type: 'sql_chart' }),
        ).toBe(false);
    });

    it('gates SQL chart edits only when the patch can change the SQL', () => {
        expect(
            isSqlApprovalToolCall('editContent', {
                type: 'sql_chart',
                patch: [{ op: 'replace', path: '/sql', value: 'select 1' }],
            }),
        ).toBe(true);
        expect(
            isSqlApprovalToolCall('editContent', {
                type: 'sql_chart',
                patch: [
                    { op: 'replace', path: '', value: { sql: 'select 1' } },
                ],
            }),
        ).toBe(true);
        expect(
            isSqlApprovalToolCall('editContent', {
                type: 'sql_chart',
                patch: [{ op: 'replace', path: '/name', value: 'Orders' }],
            }),
        ).toBe(false);
        expect(
            isSqlApprovalToolCall('editContent', {
                type: 'sql_chart',
                patch: [{ op: 'copy', from: '/description', path: '/sql' }],
            }),
        ).toBe(false);
        expect(
            isSqlApprovalToolCall('editContent', {
                type: 'chart',
                patch: [{ op: 'replace', path: '/sql', value: 'select 1' }],
            }),
        ).toBe(false);
    });
});

describe('getSqlApprovalSql', () => {
    it('reads the SQL from runSql and SQL chart arguments', () => {
        expect(getSqlApprovalSql({ sql: 'select 1' })).toBe('select 1');
        expect(
            getSqlApprovalSql({
                type: 'sql_chart',
                content: { sql: 'select 2' },
            }),
        ).toBe('select 2');
        expect(
            getSqlApprovalSql({
                type: 'sql_chart',
                patch: [{ op: 'replace', path: '/sql', value: 'select 3' }],
            }),
        ).toBe('select 3');
    });

    it('returns null when the arguments carry no SQL', () => {
        expect(getSqlApprovalSql(null)).toBeNull();
        expect(getSqlApprovalSql({ type: 'sql_chart' })).toBeNull();
        expect(
            getSqlApprovalSql({ type: 'sql_chart', content: { name: 'x' } }),
        ).toBeNull();
        expect(
            getSqlApprovalSql({
                type: 'sql_chart',
                patch: [{ op: 'replace', path: '/name', value: 'x' }],
            }),
        ).toBeNull();
    });
});

describe('getPatchedSql', () => {
    it('reads the last SQL a patch sets', () => {
        expect(
            getPatchedSql([
                { op: 'replace', path: '/sql', value: 'select 1' },
                { op: 'replace', path: '/sql', value: 'select 2' },
            ]),
        ).toBe('select 2');
    });

    it('reads the SQL from a whole-chart replacement', () => {
        expect(
            getPatchedSql([
                { op: 'replace', path: '', value: { sql: 'select 4' } },
            ]),
        ).toBe('select 4');
    });

    it('returns null when the patch also changes the SQL without a literal value', () => {
        expect(
            getPatchedSql([
                { op: 'replace', path: '/sql', value: 'select 2' },
                { op: 'copy', from: '/description', path: '/sql' },
            ]),
        ).toBeNull();
    });

    it('returns null when the patch sets no SQL', () => {
        expect(
            getPatchedSql([{ op: 'replace', path: '/name', value: 'x' }]),
        ).toBeNull();
        expect(getPatchedSql(undefined)).toBeNull();
    });
});

describe('getSqlChartPatchSqlErrors', () => {
    it('allows literal SQL values and copying the SQL elsewhere', () => {
        expect(
            getSqlChartPatchSqlErrors([
                { op: 'replace', path: '/sql', value: 'select 1' },
                { op: 'add', path: '', value: { sql: 'select 2' } },
                { op: 'copy', from: '/sql', path: '/description' },
                { op: 'replace', path: '/sqlNotes', value: 1 },
            ]),
        ).toEqual([]);
    });

    it('rejects every operation that changes the SQL without a literal value', () => {
        expect(
            getSqlChartPatchSqlErrors([
                { op: 'copy', from: '/description', path: '/sql' },
                { op: 'move', from: '/description', path: '' },
                { op: 'remove', path: '/sql' },
                { op: 'move', from: '/sql', path: '/description' },
                { op: 'replace', path: '/sql', value: 1 },
                { op: 'replace', path: '', value: { name: 'x' } },
                { op: 'add', path: '/sql/0', value: 's' },
            ]),
        ).toEqual([
            'patch[0].path: "copy" cannot change "/sql"; use "replace" with the full SQL string',
            'patch[1].path: "move" cannot change ""; use "replace" with the full SQL string',
            'patch[2].path: "remove" cannot change "/sql"; use "replace" with the full SQL string',
            'patch[3].from: "move" cannot remove "/sql"; use "copy" to reuse the SQL',
            'patch[4].path: "replace" at "/sql" needs a string value',
            'patch[5].path: "replace" at "" needs an object value with a string "sql"',
            'patch[6].path: "add" cannot change "/sql/0"; use "replace" with the full SQL string at "/sql"',
        ]);
    });
});
