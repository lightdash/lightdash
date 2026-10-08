import { LightdashAnalytics } from '../../../../analytics/LightdashAnalytics';
import {
    buildSqlApprovalDecidedEvent,
    getSqlApprovalSql,
    isSqlApprovalToolCall,
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
        expect(getSqlApprovalSql(null)).toBe('');
    });
});
