import {
    type AiChartRuntimeOverrides,
    type AiDashboardRuntimeOverrides,
    type AiThreadCreatedFrom,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const AiThreadMessageSequenceTableName = 'ai_thread_message_sequence';
export const AiThreadMessageTableName = 'ai_thread_message';
export const AiMessagePartTableName = 'ai_message_part';

export const AI_AGENT_STORAGE_VERSIONS = [1, 3] as const;
export type AiAgentStorageVersion = (typeof AI_AGENT_STORAGE_VERSIONS)[number];

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
export type AiAssistantMessageTerminalStatus = Exclude<
    AiAssistantMessageStatus,
    'in_progress'
>;
export const AI_ASSISTANT_MESSAGE_TERMINAL_STATUSES = [
    'completed',
    'error',
    'canceled',
] as const satisfies readonly AiAssistantMessageTerminalStatus[];

export const AI_MESSAGE_PART_TYPES = [
    'text',
    'reasoning',
    'tool',
    'file',
    'artifact',
    'step-start',
    'source',
    'compaction',
] as const;
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

export type AiModelConfigEnvelope = {
    version: number;
    modelName: string;
    modelProvider: string;
    reasoning: {
        enabled: boolean;
        effort: string | null;
        budgetTokens: number | null;
    };
    limits: {
        maxSteps: number | null;
        maxOutputTokens: number | null;
    };
    sampling: {
        temperature: number | null;
        topP: number | null;
    };
    providerOptions: Record<string, unknown> | null;
};

export type AiTokenUsageEnvelope = {
    version: number;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    reasoningTokens: number | null;
    cachedInputTokens: number | null;
};

export type AiRunErrorEnvelope = {
    version: number;
    name: string;
    message: string;
    data: Record<string, unknown> | null;
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
    last_heartbeat_at?: Date | Knex.Raw;
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

export type AiCanonicalReferencedArtifact = {
    artifactVersionUuid: string;
    artifactUuid: string;
    projectUuid: string;
    similarityScore: number | null;
    versionNumber: number;
    title: string | null;
    description: string | null;
    artifactType: string;
    createdAt: string;
};

export type AiCanonicalLegacyMetadata =
    | {
          type: 'response';
          vizConfigOutput: unknown;
          filtersOutput: unknown;
          metricQuery: unknown;
          savedQueryUuid: string | null;
          humanScore: number | null;
          humanFeedback: string | null;
          referencedArtifacts: AiCanonicalReferencedArtifact[];
          interrupts: {
              createdByUserUuid: string | null;
              createdAt: string;
          }[];
      }
    | {
          type: 'steer';
          consumedAt: string | null;
          consumedStep: number | null;
      };

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
