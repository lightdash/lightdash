import {
    assertUnreachable,
    isSqlApprovalToolCall,
    type SqlApprovalToolName,
} from '@lightdash/common';
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

// Tools whose Slack runs suspend on the AI SDK's native approval.
export const NATIVE_SQL_APPROVAL_TOOL_NAMES = [
    'runSql',
    'createContent',
] as const satisfies readonly SqlApprovalToolName[];

export type NativeSqlApprovalToolName =
    (typeof NATIVE_SQL_APPROVAL_TOOL_NAMES)[number];

export const isNativeSqlApprovalToolCall = (
    toolName: string,
    toolArgs: unknown,
): toolName is NativeSqlApprovalToolName =>
    isSqlApprovalToolCall(toolName, toolArgs) &&
    (NATIVE_SQL_APPROVAL_TOOL_NAMES as readonly string[]).includes(toolName);

export const RUN_SQL_REJECTED_RESULT =
    'User rejected this SQL execution. Do not retry the same query; ask the user what they would like instead.';

export const SQL_CHART_REJECTED_RESULT =
    'User rejected the SQL for this SQL chart, so nothing was saved. Do not retry the same SQL; ask the user what they would like instead.';

/** The result stored for a natively gated call the user rejected. */
export const getRejectedOutput = (
    toolName: NativeSqlApprovalToolName,
): { result: string; metadata: { status: 'rejected' | 'error' } } => {
    switch (toolName) {
        case 'runSql':
            return {
                result: RUN_SQL_REJECTED_RESULT,
                metadata: { status: 'rejected' },
            };
        case 'createContent':
            return {
                result: SQL_CHART_REJECTED_RESULT,
                metadata: { status: 'error' },
            };
        default:
            return assertUnreachable(toolName, 'Unknown SQL approval tool');
    }
};

/** Heading of the Slack approval card. */
export const getSqlApprovalHeading = (
    toolName: NativeSqlApprovalToolName,
): string => {
    switch (toolName) {
        case 'runSql':
            return 'Awaiting approval to run SQL';
        case 'createContent':
            return 'Awaiting approval to save SQL chart';
        default:
            return assertUnreachable(toolName, 'Unknown SQL approval tool');
    }
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

/** Nothing to wait on: the caller already approved the SQL. */
export const approveClientSql: ApproveSqlFn = async () => {};
