import { LightdashAnalytics } from '../../../../analytics/LightdashAnalytics';
import { buildSqlApprovalDecidedEvent } from './sqlApprovals';

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
                decidedByUserUuid: 'user-uuid',
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
            decidedByUserUuid: 'user-uuid',
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
            decidedByUserUuid: null,
        });

        expect(event.userId).toBeUndefined();
        expect(event.anonymousId).toBe(LightdashAnalytics.anonymousId);
        expect(event.properties).toMatchObject({
            source: 'thread_auto_approve',
            isAutoApproved: true,
            isThreadAutoApproval: true,
        });
    });
});
