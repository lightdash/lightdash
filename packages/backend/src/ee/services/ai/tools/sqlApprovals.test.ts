import { LightdashAnalytics } from '../../../../analytics/LightdashAnalytics';
import {
    buildSqlApprovalDecidedEvent,
    findSameTurnSqlApproval,
    isNativeSqlApprovalToolCall,
    type SqlApprovalDecisionOnCall,
} from './sqlApprovals';

const baseDecision = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    toolCallId: 'tool-call-1',
    toolName: 'runSql',
} as const;

describe('buildSqlApprovalDecidedEvent', () => {
    it('attributes a human decision to the deciding user', () => {
        expect(
            buildSqlApprovalDecidedEvent({
                ...baseDecision,
                decision: 'rejected',
                source: 'web',
                userUuid: 'user-uuid',
            }),
        ).toEqual({
            event: 'ai_agent.sql_approval_decided',
            userId: 'user-uuid',
            properties: {
                organizationId: 'org-uuid',
                projectId: 'project-uuid',
                aiAgentId: 'agent-uuid',
                threadId: 'thread-uuid',
                toolCallId: 'tool-call-1',
                toolName: 'runSql',
                decision: 'rejected',
                source: 'web',
                isAutoApproved: false,
                isThreadAutoApproval: false,
            },
        });
    });

    it('marks agent-level auto-approval as automatic, keeping the user when known', () => {
        const event = buildSqlApprovalDecidedEvent({
            ...baseDecision,
            toolName: 'runComposerQueries',
            decision: 'approved',
            source: 'auto_approve',
            userUuid: 'user-uuid',
        });

        expect(event.userId).toBe('user-uuid');
        expect(event.properties).toMatchObject({
            toolName: 'runComposerQueries',
            source: 'auto_approve',
            isAutoApproved: true,
            isThreadAutoApproval: false,
        });
    });

    it('tracks thread auto-approval anonymously when no user decided', () => {
        const event = buildSqlApprovalDecidedEvent({
            ...baseDecision,
            decision: 'approved',
            source: 'thread_auto_approve',
            userUuid: null,
        });

        expect(event.userId).toBeUndefined();
        expect(event.anonymousId).toBe(LightdashAnalytics.anonymousId);
        expect(event.properties).toMatchObject({
            source: 'thread_auto_approve',
            isAutoApproved: true,
            isThreadAutoApproval: true,
        });
    });

    it('marks a repeat of SQL approved earlier in the turn as automatic, crediting the earlier decider', () => {
        const event = buildSqlApprovalDecidedEvent({
            ...baseDecision,
            toolName: 'createContent',
            decision: 'approved',
            source: 'same_turn_approval',
            userUuid: 'user-uuid',
        });

        expect(event.userId).toBe('user-uuid');
        expect(event.properties).toMatchObject({
            source: 'same_turn_approval',
            isAutoApproved: true,
            isThreadAutoApproval: false,
        });
    });

    it('attributes a timed-out approval to the prompted user as a human decision', () => {
        const event = buildSqlApprovalDecidedEvent({
            ...baseDecision,
            decision: 'timed_out',
            source: 'slack',
            userUuid: 'prompted-user-uuid',
        });

        expect(event.userId).toBe('prompted-user-uuid');
        expect(event.properties).toMatchObject({
            decision: 'timed_out',
            source: 'slack',
            isAutoApproved: false,
            isThreadAutoApproval: false,
        });
    });
});

describe('isNativeSqlApprovalToolCall', () => {
    it('covers the tools whose Slack runs suspend on approval', () => {
        expect(isNativeSqlApprovalToolCall('runSql', { sql: 'select 1' })).toBe(
            true,
        );
        expect(
            isNativeSqlApprovalToolCall('createContent', { type: 'sql_chart' }),
        ).toBe(true);
        expect(
            isNativeSqlApprovalToolCall('createContent', { type: 'chart' }),
        ).toBe(false);
        expect(
            isNativeSqlApprovalToolCall('editContent', {
                type: 'sql_chart',
                patch: [{ op: 'replace', path: '/sql', value: 'select 1' }],
            }),
        ).toBe(true);
        expect(isNativeSqlApprovalToolCall('runComposerQueries', {})).toBe(
            false,
        );
        expect(
            isNativeSqlApprovalToolCall('runComposerQueries', {
                queries: [
                    { nodeId: 'raw', sourceType: 'sql', sql: 'select 1' },
                ],
            }),
        ).toBe(true);
    });
});

describe('findSameTurnSqlApproval', () => {
    const runSqlApproved: SqlApprovalDecisionOnCall = {
        toolCallId: 'run-sql-1',
        toolName: 'runSql',
        toolArgs: { sql: 'select 1', limit: 10 },
        decision: 'approved',
        decidedByUserUuid: 'user-uuid',
    };

    it('finds an approved call in the turn with the same SQL', () => {
        expect(
            findSameTurnSqlApproval([runSqlApproved], {
                toolCallId: 'create-1',
                sql: 'select 1;',
                nodeSql: null,
            }),
        ).toEqual({ decidedByUserUuid: 'user-uuid' });
    });

    it('reads the SQL a SQL chart save or edit was approved for', () => {
        const createApproved: SqlApprovalDecisionOnCall = {
            toolCallId: 'create-1',
            toolName: 'createContent',
            toolArgs: { type: 'sql_chart', content: { sql: 'select 2' } },
            decision: 'approved',
            decidedByUserUuid: null,
        };
        const editApproved: SqlApprovalDecisionOnCall = {
            toolCallId: 'edit-1',
            toolName: 'editContent',
            toolArgs: {
                type: 'sql_chart',
                patch: [{ op: 'replace', path: '/sql', value: 'select 3' }],
            },
            decision: 'approved',
            decidedByUserUuid: 'user-uuid',
        };
        const approvals = [createApproved, editApproved];
        expect(
            findSameTurnSqlApproval(approvals, {
                toolCallId: 'run-sql-1',
                sql: 'select 2',
                nodeSql: null,
            }),
        ).toEqual({ decidedByUserUuid: null });
        expect(
            findSameTurnSqlApproval(approvals, {
                toolCallId: 'run-sql-1',
                sql: 'select 3',
                nodeSql: null,
            }),
        ).toEqual({ decidedByUserUuid: 'user-uuid' });
    });

    it('ignores different SQL and rejected calls', () => {
        expect(
            findSameTurnSqlApproval([runSqlApproved], {
                toolCallId: 'create-1',
                sql: 'select 2',
                nodeSql: null,
            }),
        ).toBeNull();
        expect(
            findSameTurnSqlApproval(
                [{ ...runSqlApproved, decision: 'rejected' }],
                {
                    toolCallId: 'create-1',
                    sql: 'select 1',
                    nodeSql: null,
                },
            ),
        ).toBeNull();
    });

    it('matches a composer approval only against its whole pipeline SQL', () => {
        const composerApproved: SqlApprovalDecisionOnCall = {
            ...runSqlApproved,
            toolCallId: 'composer-1',
            toolName: 'runComposerQueries',
            toolArgs: {
                queries: [
                    { nodeId: 'raw', sourceType: 'sql', sql: 'select 1' },
                ],
            },
        };
        expect(
            findSameTurnSqlApproval([composerApproved], {
                toolCallId: 'run-sql-2',
                sql: 'select 1',
                nodeSql: null,
            }),
        ).toBeNull();
        expect(
            findSameTurnSqlApproval([composerApproved], {
                toolCallId: 'composer-2',
                sql: '-- raw\nselect 1',
                nodeSql: null,
            }),
        ).toEqual({ decidedByUserUuid: 'user-uuid' });
    });

    describe('composer chart edit nodes', () => {
        const contentQueryApproved = (
            toolCallId: string,
            sql: string,
        ): SqlApprovalDecisionOnCall => ({
            ...runSqlApproved,
            toolCallId,
            toolName: 'runContentQuery',
            toolArgs: { source: { type: 'sql', sql, limit: null } },
        });
        const edit = (nodes: Array<[string, string]>) => ({
            toolCallId: 'edit-1',
            sql: nodes.map(([id, sql]) => `-- ${id}\n${sql}`).join('\n\n'),
            nodeSql: nodes.map(([, sql]) => sql),
        });

        it('covers a node whose SQL was approved on its own', () => {
            expect(
                findSameTurnSqlApproval(
                    [contentQueryApproved('query-1', 'select 1;')],
                    edit([['payments', 'select 1']]),
                ),
            ).toEqual({ decidedByUserUuid: 'user-uuid' });
        });

        it('asks for SQL that differs in one character', () => {
            expect(
                findSameTurnSqlApproval(
                    [contentQueryApproved('query-1', 'select 1')],
                    edit([['payments', 'select 2']]),
                ),
            ).toBeNull();
        });

        it('asks unless every node was approved', () => {
            const decisions = [
                contentQueryApproved('query-1', 'select 1'),
                contentQueryApproved('query-2', 'select 2'),
            ];
            expect(
                findSameTurnSqlApproval(
                    decisions.slice(0, 1),
                    edit([
                        ['a', 'select 1'],
                        ['b', 'select 2'],
                    ]),
                ),
            ).toBeNull();
            expect(
                findSameTurnSqlApproval(
                    decisions,
                    edit([
                        ['a', 'select 1'],
                        ['b', 'select 2'],
                    ]),
                ),
            ).toEqual({ decidedByUserUuid: 'user-uuid' });
        });

        it('ignores rejected SQL', () => {
            expect(
                findSameTurnSqlApproval(
                    [
                        {
                            ...contentQueryApproved('query-1', 'select 1'),
                            decision: 'rejected',
                        },
                    ],
                    edit([['payments', 'select 1']]),
                ),
            ).toBeNull();
        });

        it('does not split a composer pipeline approval into its nodes', () => {
            const composerApproved: SqlApprovalDecisionOnCall = {
                ...runSqlApproved,
                toolCallId: 'composer-1',
                toolName: 'runComposerQueries',
                toolArgs: {
                    queries: [
                        { nodeId: 'raw', sourceType: 'sql', sql: 'select 1' },
                    ],
                },
            };
            expect(
                findSameTurnSqlApproval(
                    [composerApproved],
                    edit([['payments', 'select 1']]),
                ),
            ).toBeNull();
            expect(
                findSameTurnSqlApproval(
                    [composerApproved],
                    edit([['raw', 'select 1']]),
                ),
            ).toEqual({ decidedByUserUuid: 'user-uuid' });
        });

        it('never reuses a composer chart edit approval', () => {
            const editApproved: SqlApprovalDecisionOnCall = {
                ...runSqlApproved,
                toolCallId: 'edit-0',
                toolName: 'editContent',
                toolArgs: {
                    type: 'composer_chart',
                    slug: 'payments',
                    patch: [
                        {
                            op: 'replace',
                            path: '/pipeline/nodes/0/sql',
                            value: 'select 1',
                        },
                        {
                            op: 'replace',
                            path: '/pipeline/nodes/1/sql',
                            value: 'select * from payments',
                        },
                    ],
                },
            };
            expect(
                findSameTurnSqlApproval([editApproved], {
                    toolCallId: 'run-sql-2',
                    sql: 'select 1\n\nselect * from payments',
                    nodeSql: null,
                }),
            ).toBeNull();
            expect(
                findSameTurnSqlApproval(
                    [editApproved],
                    edit([['other', 'select 1']]),
                ),
            ).toBeNull();
        });

        it('compares node by node only for a composer chart edit', () => {
            expect(
                findSameTurnSqlApproval([runSqlApproved], {
                    toolCallId: 'composer-2',
                    sql: '-- raw\nselect 1',
                    nodeSql: null,
                }),
            ).toBeNull();
        });
    });

    it('leaves a call that has its own decision to that decision', () => {
        expect(
            findSameTurnSqlApproval(
                [
                    runSqlApproved,
                    {
                        ...runSqlApproved,
                        toolCallId: 'run-sql-2',
                        decision: 'rejected',
                    },
                ],
                {
                    toolCallId: 'run-sql-2',
                    sql: 'select 1',
                    nodeSql: null,
                },
            ),
        ).toBeNull();
    });
});
