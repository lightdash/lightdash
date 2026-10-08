import {
    LightdashAnalytics,
    type AiAgentSqlApprovalDecidedEvent,
} from '../../../../analytics/LightdashAnalytics';
import { type AiSqlApprovalDecision } from '../../../database/entities/ai';

// SQL approval decisions (approved / rejected) persist per tool call in the
// `ai_sql_approval` table; the thread-level "approve & don't ask again" flag
// persists on `ai_thread.sql_auto_approved_at`. Both survive pod restarts and
// cross-pod requests (Slack interactivity is handled by the API pod while the
// agent runs on the scheduler worker).

export type SqlApprovalDecision = AiSqlApprovalDecision | 'timeout';

type SqlApprovalDecidedProperties =
    AiAgentSqlApprovalDecidedEvent['properties'];

export type SqlApprovalToolName = SqlApprovalDecidedProperties['toolName'];

export const isSqlApprovalToolName = (
    toolName: string,
): toolName is SqlApprovalToolName =>
    toolName === 'runSql' || toolName === 'runComposerQueries';

/** `approved_always` is "approve & don't ask again"; it is stored as `approved`. */
export type SqlApprovalDecisionKind = SqlApprovalDecidedProperties['decision'];

export type SqlApprovalDecisionSource = SqlApprovalDecidedProperties['source'];

export type SqlAutoApprovalSource = Extract<
    SqlApprovalDecisionSource,
    'auto_approve' | 'thread_auto_approve'
>;

export type SqlApprovalDecisionRecord = {
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    toolCallId: string;
    toolName: SqlApprovalToolName;
    decision: SqlApprovalDecisionKind;
    source: SqlApprovalDecisionSource;
    decidedByUserUuid: string | null;
};

export const toStoredSqlApprovalDecision = (
    decision: SqlApprovalDecisionKind,
): AiSqlApprovalDecision => (decision === 'rejected' ? 'rejected' : 'approved');

export const buildSqlApprovalDecidedEvent = (
    record: SqlApprovalDecisionRecord,
): AiAgentSqlApprovalDecidedEvent => ({
    event: 'ai_agent.sql_approval_decided',
    ...(record.decidedByUserUuid === null
        ? { anonymousId: LightdashAnalytics.anonymousId }
        : { userId: record.decidedByUserUuid }),
    properties: {
        organizationId: record.organizationUuid,
        projectId: record.projectUuid,
        aiAgentId: record.agentUuid,
        threadId: record.threadUuid,
        toolCallId: record.toolCallId,
        toolName: record.toolName,
        decision: record.decision,
        source: record.source,
        isAutoApproved:
            record.source === 'auto_approve' ||
            record.source === 'thread_auto_approve',
        isThreadAutoApproval: record.source === 'thread_auto_approve',
    },
});
