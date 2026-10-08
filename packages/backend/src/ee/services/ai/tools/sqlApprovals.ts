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
    toolName === 'runSql' ||
    toolName === 'runComposerQueries' ||
    toolName === 'createContent';

const isSqlChartContentArgs = (toolArgs: unknown): boolean =>
    typeof toolArgs === 'object' &&
    toolArgs !== null &&
    'type' in toolArgs &&
    toolArgs.type === 'sql_chart';

/** Content tools only gate on approval when they save a SQL chart. */
export const isSqlApprovalToolCall = (
    toolName: string,
    toolArgs: unknown,
): toolName is SqlApprovalToolName => {
    if (!isSqlApprovalToolName(toolName)) return false;
    return toolName === 'createContent'
        ? isSqlChartContentArgs(toolArgs)
        : true;
};

/** The SQL a pending approval asks the user to accept. */
export const getSqlApprovalSql = (toolArgs: unknown): string => {
    if (typeof toolArgs !== 'object' || toolArgs === null) return '';
    if ('sql' in toolArgs && typeof toolArgs.sql === 'string') {
        return toolArgs.sql;
    }
    if (
        'content' in toolArgs &&
        typeof toolArgs.content === 'object' &&
        toolArgs.content !== null &&
        'sql' in toolArgs.content &&
        typeof toolArgs.content.sql === 'string'
    ) {
        return toolArgs.content.sql;
    }
    return '';
};

/** `approved_always` is stored as `approved`; `timed_out` is tracked but never stored. */
export type SqlApprovalDecisionKind = SqlApprovalDecidedProperties['decision'];

export type StorableSqlApprovalDecisionKind = Exclude<
    SqlApprovalDecisionKind,
    'timed_out'
>;

export type SqlApprovalDecisionSource = SqlApprovalDecidedProperties['source'];

export type SqlPromptedApprovalSource = Extract<
    SqlApprovalDecisionSource,
    'web' | 'slack'
>;

export type SqlAutoApprovalSource = Extract<
    SqlApprovalDecisionSource,
    'auto_approve' | 'thread_auto_approve'
>;

/** Tracks an approval wait that ended with no decision. */
export type TrackSqlApprovalTimeoutFn = (args: {
    toolCallId: string;
    toolName: SqlApprovalToolName;
    promptedUserUuid: string | null;
    source: SqlPromptedApprovalSource;
}) => void;

export type SqlApprovalDecisionRecord = {
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    toolCallId: string;
    toolName: SqlApprovalToolName;
    decision: SqlApprovalDecisionKind;
    source: SqlApprovalDecisionSource;
    // The deciding user, or for timeouts the user who was asked.
    userUuid: string | null;
};

export type StorableSqlApprovalDecisionRecord = SqlApprovalDecisionRecord & {
    decision: StorableSqlApprovalDecisionKind;
};

export const toStoredSqlApprovalDecision = (
    decision: StorableSqlApprovalDecisionKind,
): AiSqlApprovalDecision => (decision === 'rejected' ? 'rejected' : 'approved');

export const buildSqlApprovalDecidedEvent = (
    record: SqlApprovalDecisionRecord,
): AiAgentSqlApprovalDecidedEvent => ({
    event: 'ai_agent.sql_approval_decided',
    ...(record.userUuid === null
        ? { anonymousId: LightdashAnalytics.anonymousId }
        : { userId: record.userUuid }),
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

export type SqlApprovalOutcome = 'approved' | 'rejected' | 'timeout';

/** Thrown when the user declined, or never answered, a SQL approval. */
export class SqlNotApprovedError extends Error {
    readonly outcome: Exclude<SqlApprovalOutcome, 'approved'>;

    constructor(
        outcome: Exclude<SqlApprovalOutcome, 'approved'>,
        // Shown to the model as the tool result.
        message: string,
    ) {
        super(message);
        this.name = 'SqlNotApprovedError';
        this.outcome = outcome;
    }
}

/** Resolves once the SQL is approved; throws SqlNotApprovedError otherwise. */
export type ApproveSqlFn = () => Promise<void>;
