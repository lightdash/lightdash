import {
    getPatchedSql,
    getSqlApprovalSql,
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
                patch: [{ op: 'replace', path: '', value: {} }],
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

    it('returns null when the patch sets no SQL', () => {
        expect(
            getPatchedSql([{ op: 'replace', path: '/name', value: 'x' }]),
        ).toBeNull();
        expect(getPatchedSql(undefined)).toBeNull();
    });
});
