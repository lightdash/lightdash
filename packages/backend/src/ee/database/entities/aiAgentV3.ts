import {
    AI_AGENT_RUN_TERMINAL_STATUSES,
    AI_AGENT_V3_PART_TYPES,
    UnexpectedServerError,
    type AiAgentRunTerminalStatus,
    type AiAgentV3LegacyMetadata,
    type AiAgentV3ModelConfig,
    type AiAgentV3ReferencedArtifact,
    type AiAgentV3RunError,
    type AiAgentV3TokenUsage,
    type AiChartRuntimeOverrides,
    type AiDashboardRuntimeOverrides,
    type AiThreadCreatedFrom,
    type AiAgentStorageVersion as CommonAiAgentStorageVersion,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const AiThreadMessageSequenceTableName = 'ai_thread_message_sequence';
export const AiThreadMessageTableName = 'ai_thread_message';
export const AiMessagePartTableName = 'ai_message_part';
export const AiToolApprovalTableName = 'ai_tool_approval';

export const AI_AGENT_STORAGE_VERSIONS = [
    1, 3,
] as const satisfies readonly CommonAiAgentStorageVersion[];
export type AiAgentStorageVersion = CommonAiAgentStorageVersion;

export const AI_THREAD_LINEAGE_KINDS = ['spawn', 'fork'] as const;
export type AiThreadLineageKind = (typeof AI_THREAD_LINEAGE_KINDS)[number];

export const AI_THREAD_MESSAGE_ROLES = [
    'user',
    'assistant',
    'compaction',
] as const;
export type AiThreadMessageRole = (typeof AI_THREAD_MESSAGE_ROLES)[number];

export const AI_ASSISTANT_MESSAGE_STATUSES = [
    'in_progress',
    'completed',
    'error',
    'canceled',
] as const;
export type AiAssistantMessageStatus =
    (typeof AI_ASSISTANT_MESSAGE_STATUSES)[number];
export type AiAssistantMessageTerminalStatus = AiAgentRunTerminalStatus;
export const AI_ASSISTANT_MESSAGE_TERMINAL_STATUSES =
    AI_AGENT_RUN_TERMINAL_STATUSES satisfies readonly AiAssistantMessageStatus[];

export const AI_MESSAGE_PART_TYPES = AI_AGENT_V3_PART_TYPES;
export type AiMessagePartType = (typeof AI_MESSAGE_PART_TYPES)[number];
export type AiMessagePartTypeOrUnknown = AiMessagePartType | (string & {});

export const AI_CONTEXT_ENTITY_TYPES = [
    'chart',
    'dashboard',
    'thread',
    'file',
    'repository',
    'pull_request',
    'proposed_change',
    'review_finding',
    'preview_environment',
] as const;
export type AiCanonicalContextEntityType =
    (typeof AI_CONTEXT_ENTITY_TYPES)[number];

export const AI_TOOL_PART_STATES = [
    'input-streaming',
    'input-available',
    'approval-requested',
    'approval-responded',
    'output-available',
    'output-error',
    'output-denied',
] as const;
export type AiToolPartState = (typeof AI_TOOL_PART_STATES)[number];
export const AI_TOOL_PART_TERMINAL_STATES = [
    'output-available',
    'output-error',
    'output-denied',
] as const satisfies readonly AiToolPartState[];
export const AI_TOOL_PART_INTERRUPTED_STATE =
    'output-error' as const satisfies AiToolPartState;

export const MODEL_VISIBLE_AI_MESSAGE_PART_TYPES = [
    'text',
    'reasoning',
    'tool',
    'file',
    'compaction',
] as const satisfies readonly AiMessagePartType[];

export const NON_USER_AI_MESSAGE_PART_TYPES = [
    'reasoning',
    'tool',
    'artifact',
    'step-start',
    'compaction',
] as const satisfies readonly AiMessagePartType[];

export type AiModelConfigEnvelope = AiAgentV3ModelConfig;
export type AiTokenUsageEnvelope = AiAgentV3TokenUsage;
export type AiRunErrorEnvelope = AiAgentV3RunError;
export type AiCompactionPreservedContext = {
    artifacts: string[];
    pinnedContext: string[];
};

export type DbAiThreadMessageSequence = {
    ai_thread_uuid: string;
    next_thread_seq: number;
};

export type AiThreadMessageSequenceTable = Knex.CompositeTableType<
    DbAiThreadMessageSequence,
    Pick<DbAiThreadMessageSequence, 'ai_thread_uuid'> &
        Partial<Pick<DbAiThreadMessageSequence, 'next_thread_seq'>>,
    Pick<DbAiThreadMessageSequence, 'next_thread_seq'>
>;

export type DbAiThreadMessage = {
    ai_thread_message_uuid: string;
    ai_thread_uuid: string;
    thread_seq: number;
    role: AiThreadMessageRole;
    created_by_user_uuid: string | null;
    status: AiAssistantMessageStatus | null;
    last_heartbeat_at: Date | null;
    model_config: AiModelConfigEnvelope | null;
    token_usage: AiTokenUsageEnvelope | null;
    error: AiRunErrorEnvelope | null;
    created_at: Date;
};

type AiThreadMessageHeartbeatWrite = {
    last_heartbeat_at?: Date | Knex.Raw | null;
};

type AiThreadMessageInsert = Pick<
    DbAiThreadMessage,
    'ai_thread_uuid' | 'thread_seq' | 'role'
> &
    Partial<
        Pick<
            DbAiThreadMessage,
            | 'created_by_user_uuid'
            | 'status'
            | 'model_config'
            | 'token_usage'
            | 'error'
            | 'created_at'
        >
    > &
    AiThreadMessageHeartbeatWrite;

type AiThreadMessageUpdate = Partial<
    Pick<DbAiThreadMessage, 'status' | 'token_usage' | 'error'>
> &
    AiThreadMessageHeartbeatWrite;

export type AiThreadMessageTable = Knex.CompositeTableType<
    DbAiThreadMessage,
    AiThreadMessageInsert,
    AiThreadMessageUpdate
>;

export type DbAiMessagePart = {
    ai_message_part_uuid: string;
    ai_thread_message_uuid: string;
    part_index: number;
    type: AiMessagePartTypeOrUnknown;
    payload_version: number;
    payload: Record<string, unknown>;
    tool_call_id: string | null;
    ai_artifact_version_uuid: string | null;
    created_at: Date;
};

export type AiMessagePartTable = Knex.CompositeTableType<
    DbAiMessagePart,
    Pick<
        DbAiMessagePart,
        'ai_thread_message_uuid' | 'part_index' | 'payload_version' | 'payload'
    > & {
        type: AiMessagePartType;
    } & Partial<
            Pick<DbAiMessagePart, 'tool_call_id' | 'ai_artifact_version_uuid'>
        >,
    Partial<Pick<DbAiMessagePart, 'payload_version'>> & {
        payload?: Record<string, unknown> | Knex.Raw;
    }
>;

export type AiToolApprovalDecision = 'approved' | 'rejected';
export const AI_TOOL_APPROVAL_DEFAULT_REASONS = {
    approved: 'Approved by user',
    rejected: 'Denied by user',
} as const satisfies Record<AiToolApprovalDecision, string>;

export type AiToolApprovalPayload = {
    id: string;
    signature: string | null;
    approved: boolean | null;
    reason: string | null;
    decidedByUserUuid: string | null;
    decidedAt: string | null;
};

export const getAiToolApprovalPayload = (
    payload: Record<string, unknown>,
): AiToolApprovalPayload | null => {
    const { approval } = payload;
    if (approval === undefined) return null;
    if (
        approval === null ||
        typeof approval !== 'object' ||
        Array.isArray(approval)
    ) {
        throw new UnexpectedServerError('Malformed tool approval payload');
    }
    const value = approval as Record<string, unknown>;
    const { id, signature, approved, reason, decidedByUserUuid, decidedAt } =
        value;
    if (typeof id !== 'string') {
        throw new UnexpectedServerError('Malformed tool approval payload');
    }
    const isNullableString = (
        field: unknown,
    ): field is string | null | undefined =>
        field === undefined || field === null || typeof field === 'string';
    if (
        !isNullableString(signature) ||
        (approved !== undefined &&
            approved !== null &&
            typeof approved !== 'boolean') ||
        !isNullableString(reason) ||
        !isNullableString(decidedByUserUuid) ||
        !isNullableString(decidedAt)
    ) {
        throw new UnexpectedServerError('Malformed tool approval payload');
    }
    return {
        id,
        signature: signature ?? null,
        approved: approved ?? null,
        reason: reason ?? null,
        decidedByUserUuid: decidedByUserUuid ?? null,
        decidedAt: decidedAt ?? null,
    };
};

export type DbAiToolApproval = {
    ai_message_part_uuid: string;
    approval_id: string;
    decision: AiToolApprovalDecision;
    reason: string | null;
    decided_by_user_uuid: string | null;
    decided_at: Date;
};

export type AiToolApprovalTable = Knex.CompositeTableType<
    DbAiToolApproval,
    Pick<
        DbAiToolApproval,
        | 'ai_message_part_uuid'
        | 'approval_id'
        | 'decision'
        | 'reason'
        | 'decided_by_user_uuid'
    >,
    never
>;

export type AiV3ThreadLineage =
    | null
    | {
          kind: 'spawn';
          parentThreadUuid: string;
          parentMessageUuid: string;
          parentToolCallId: string;
      }
    | {
          kind: 'fork';
          parentThreadUuid: string;
          forkBoundarySeq: number;
      };

export type CreateAiV3Thread = {
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string | null;
    createdFrom: AiThreadCreatedFrom;
    lineage: AiV3ThreadLineage;
    ownerUserUuid?: string;
};

type AiV3PartWriteBase = {
    partIndex: number;
    payloadVersion: number;
    payload: Record<string, unknown>;
};

export type AiV3PartWrite =
    | (AiV3PartWriteBase & {
          type: 'tool';
          toolCallId: string;
          artifactVersionUuid?: never;
      })
    | (AiV3PartWriteBase & {
          type: 'artifact';
          artifactVersionUuid: string;
          toolCallId?: never;
      })
    | (AiV3PartWriteBase & {
          type: Exclude<AiMessagePartType, 'tool' | 'artifact'>;
          toolCallId?: never;
          artifactVersionUuid?: never;
      });

export type AiCanonicalPart = {
    uuid: string;
    type: AiMessagePartTypeOrUnknown;
    payloadVersion: number;
    payload: Record<string, unknown>;
    toolCallId: string | null;
    artifactVersionUuid: string | null;
};

type AiCanonicalContextBase = {
    uuid: string;
    entityUuid: string | null;
    entityRef: string | null;
    pinnedVersionUuid: string | null;
    displayName: string | null;
    createdAt: string;
};

export type AiCanonicalContext = AiCanonicalContextBase &
    (
        | {
              entityType: 'chart';
              runtimeOverrides: AiChartRuntimeOverrides | null;
          }
        | {
              entityType: 'dashboard';
              runtimeOverrides: AiDashboardRuntimeOverrides | null;
          }
        | {
              entityType: Exclude<
                  AiCanonicalContextEntityType,
                  'chart' | 'dashboard'
              >;
              runtimeOverrides: null;
          }
    );

export type AiCanonicalReferencedArtifact = AiAgentV3ReferencedArtifact;
export type AiCanonicalLegacyMetadata = AiAgentV3LegacyMetadata;

export type AiCanonicalMessage = {
    uuid: string;
    role: AiThreadMessageRole;
    parts: AiCanonicalPart[];
    metadata: {
        createdAt: string;
        createdByUserUuid: string | null;
        status: AiAssistantMessageStatus | null;
        lastHeartbeatAt: string | null;
        modelConfig: AiModelConfigEnvelope | null;
        tokenUsage: AiTokenUsageEnvelope | null;
        error: AiRunErrorEnvelope | null;
        hidden: boolean;
        context: AiCanonicalContext[];
        legacy: AiCanonicalLegacyMetadata | null;
    };
};

export type AiCanonicalThread = {
    uuid: string;
    storageVersion: AiAgentStorageVersion;
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string | null;
    createdAt: string;
    updatedAt: string | null;
    createdFrom: AiThreadCreatedFrom;
    title: string | null;
    lineage: AiV3ThreadLineage;
    messages: AiCanonicalMessage[];
};
