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
            }),
        ).toEqual({ decidedByUserUuid: null });
        expect(
            findSameTurnSqlApproval(approvals, {
                toolCallId: 'run-sql-1',
                sql: 'select 3',
            }),
        ).toEqual({ decidedByUserUuid: 'user-uuid' });
    });

    it('ignores different SQL and rejected calls', () => {
        expect(
            findSameTurnSqlApproval([runSqlApproved], {
                toolCallId: 'create-1',
                sql: 'select 2',
            }),
        ).toBeNull();
        expect(
            findSameTurnSqlApproval(
                [{ ...runSqlApproved, decision: 'rejected' }],
                { toolCallId: 'create-1', sql: 'select 1' },
            ),
        ).toBeNull();
    });

    it('ignores composer pipelines, whose approval covers several queries', () => {
        expect(
            findSameTurnSqlApproval(
                [
                    {
                        ...runSqlApproved,
                        toolName: 'runComposerQueries',
                    },
                ],
                { toolCallId: 'create-1', sql: 'select 1' },
            ),
        ).toBeNull();
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
                { toolCallId: 'run-sql-2', sql: 'select 1' },
            ),
        ).toBeNull();
    });
});
