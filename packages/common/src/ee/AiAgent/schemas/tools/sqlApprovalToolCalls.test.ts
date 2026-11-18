import {
    getComposerChartPatchSql,
    getPatchedSql,
    getSameTurnSqlApprovalProgressId,
    getSqlApprovalSql,
    getSqlChartPatchSqlErrors,
    isSameApprovalSql,
    isSqlApprovalToolCall,
} from './sqlApprovalToolCalls';

const composerSqlNode = (nodeId: string, sql: string) => ({
    nodeId,
    sourceType: 'sql',
    sql,
});

describe('isSqlApprovalToolCall', () => {
    it('gates raw SQL tools and SQL chart saves only', () => {
        expect(isSqlApprovalToolCall('runSql', { sql: 'select 1' })).toBe(true);
        ['query', 'runComposerQueries'].forEach((composerToolName) => {
            expect(
                isSqlApprovalToolCall(composerToolName, {
                    queries: [composerSqlNode('raw', 'select 1')],
                }),
            ).toBe(true);
            expect(
                isSqlApprovalToolCall(composerToolName, {
                    queries: [
                        { nodeId: 'merge', sourceType: 'duckdb', sql: 'x' },
                    ],
                }),
            ).toBe(false);
        });
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

    it('gates content queries only for a SQL source', () => {
        expect(
            isSqlApprovalToolCall('runContentQuery', {
                source: { type: 'sql', sql: 'select 1', limit: null },
            }),
        ).toBe(true);
        expect(
            isSqlApprovalToolCall('runContentQuery', {
                source: { type: 'chart', chartSlug: 'orders', limit: null },
            }),
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

describe('composer chart edits', () => {
    it('gates a composer chart edit only when the patch writes SQL', () => {
        expect(
            isSqlApprovalToolCall('editContent', {
                type: 'composer_chart',
                patch: [
                    {
                        op: 'replace',
                        path: '/pipeline/nodes/1/sql',
                        value: 'select 2',
                    },
                ],
            }),
        ).toBe(true);
        expect(
            isSqlApprovalToolCall('editContent', {
                type: 'composer_chart',
                patch: [
                    {
                        op: 'replace',
                        path: '/chart/chartConfig/type',
                        value: 'table',
                    },
                ],
            }),
        ).toBe(false);
    });

    it('reads SQL set at a node and SQL in a warehouse node written whole', () => {
        const patch = [
            { op: 'replace', path: '/pipeline/nodes/0/sql', value: 'select 1' },
            {
                op: 'add',
                path: '/pipeline/nodes/-',
                value: composerSqlNode('extra', 'select 2'),
            },
            {
                op: 'add',
                path: '/pipeline/nodes/-',
                value: { nodeId: 'joined', sourceType: 'duckdb', sql: 'x' },
            },
            { op: 'remove', path: '/pipeline/nodes/3' },
        ];
        expect(getComposerChartPatchSql(patch)).toEqual([
            'select 1',
            'select 2',
        ]);
        expect(getSqlApprovalSql({ type: 'composer_chart', patch })).toBe(
            'select 1\n\nselect 2',
        );
    });
});

describe('composer chart creates', () => {
    const fromJson = {
        type: 'composer_chart',
        content: {
            from: 'json',
            dashboardSlug: 'sales',
            name: 'Revenue',
            description: null,
            pipeline: {
                terminalNodeId: 'shaped',
                nodes: [
                    { nodeId: 'raw', sourceType: 'sql', sql: 'select 1' },
                    { nodeId: 'shaped', sourceType: 'duckdb', sql: 'select 2' },
                ],
            },
            chart: {},
        },
    };

    it('asks to approve the warehouse SQL written in the JSON', () => {
        expect(isSqlApprovalToolCall('createContent', fromJson)).toBe(true);
        expect(getSqlApprovalSql(fromJson)).toBe('-- raw\nselect 1');
    });

    it('asks nothing for a query node, whose SQL was approved when it ran', () => {
        const fromNode = {
            type: 'composer_chart',
            content: {
                from: 'node',
                dashboardSlug: 'sales',
                name: 'Revenue',
                description: null,
                nodeId: 'raw',
                sessionId: null,
                vizConfig: { type: 'table' },
            },
        };
        expect(isSqlApprovalToolCall('createContent', fromNode)).toBe(false);
        expect(getSqlApprovalSql(fromNode)).toBeNull();
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
        expect(
            getSqlApprovalSql({
                source: { type: 'sql', sql: 'select 4', limit: null },
            }),
        ).toBe('select 4');
    });

    it('labels and joins every warehouse SQL node of a composer pipeline', () => {
        expect(
            getSqlApprovalSql({
                queries: [
                    composerSqlNode('orders', 'select 1'),
                    { nodeId: 'merge', sourceType: 'duckdb', sql: 'select 2' },
                    composerSqlNode('payments', 'select 3'),
                ],
            }),
        ).toBe('-- orders\nselect 1\n\n-- payments\nselect 3');
        expect(
            getSqlApprovalSql({
                queries: [{ nodeId: 'merge', sourceType: 'duckdb', sql: 'x' }],
            }),
        ).toBeNull();
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

describe('isSameApprovalSql', () => {
    it('matches the same SQL up to surrounding whitespace and trailing semicolons', () => {
        expect(isSameApprovalSql('select 1', 'select 1')).toBe(true);
        expect(isSameApprovalSql('  select 1\n', 'select 1')).toBe(true);
        expect(isSameApprovalSql('select 1;', 'select 1')).toBe(true);
        expect(isSameApprovalSql('select 1 ;\n', 'select 1')).toBe(true);
        expect(isSameApprovalSql('select 1; ;; \n', 'select 1')).toBe(true);
    });

    it('does not match SQL that differs anywhere else', () => {
        expect(isSameApprovalSql('select 1', 'SELECT 1')).toBe(false);
        expect(isSameApprovalSql('select  1', 'select 1')).toBe(false);
        expect(isSameApprovalSql('select 1; select 2', 'select 1')).toBe(false);
        expect(isSameApprovalSql("select ';'", "select '")).toBe(false);
    });
});

describe('getSameTurnSqlApprovalProgressId', () => {
    it('keys the progress event to its own tool call', () => {
        expect(getSameTurnSqlApprovalProgressId('call-1')).not.toBe(
            getSameTurnSqlApprovalProgressId('call-2'),
        );
    });
});
