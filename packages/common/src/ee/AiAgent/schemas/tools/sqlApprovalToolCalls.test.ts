import {
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
    });

    it('returns null when the arguments carry no SQL', () => {
        expect(getSqlApprovalSql(null)).toBeNull();
        expect(getSqlApprovalSql({ type: 'sql_chart' })).toBeNull();
        expect(
            getSqlApprovalSql({ type: 'sql_chart', content: { name: 'x' } }),
        ).toBeNull();
    });
});
