import {
    type AiChartRuntimeOverrides,
    type AiDashboardRuntimeOverrides,
    type AiThreadCreatedFrom,
} from './requestTypes';

export const AI_AGENT_STORAGE_VERSIONS = [1, 3] as const;
export type AiAgentStorageVersion = (typeof AI_AGENT_STORAGE_VERSIONS)[number];
export const AI_AGENT_RUN_TERMINAL_STATUSES = [
    'completed',
    'error',
    'canceled',
] as const;
export type AiAgentRunTerminalStatus =
    (typeof AI_AGENT_RUN_TERMINAL_STATUSES)[number];
export type AiAgentThreadReadOnlyReason = 'legacy' | 'slack' | 'not_owner';
export type AiAgentThreadFirstMessage = { uuid: string; message: string };
export const AI_AGENT_V3_PART_TYPES = [
    'text',
    'reasoning',
    'tool',
    'file',
    'artifact',
    'step-start',
    'source',
    'compaction',
] as const;
export type AiAgentV3KnownPartType = (typeof AI_AGENT_V3_PART_TYPES)[number];
// Reads preserve future persisted types while known types remain discriminable.
export type AiAgentV3PartType = AiAgentV3KnownPartType | (string & {});

export type AiAgentThreadCapability =
    | { readOnly: false; readOnlyReason: null }
    | {
          readOnly: true;
          readOnlyReason: AiAgentThreadReadOnlyReason;
      };

export type AiAgentV3ModelConfig = {
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

export type AiAgentV3TokenUsage = {
    version: number;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    reasoningTokens: number | null;
    cachedInputTokens: number | null;
};

export type AiAgentV3RunError = {
    version: number;
    name: string;
    message: string;
    data: Record<string, unknown> | null;
};

export type AiAgentV3ReferencedArtifact = {
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

export type AiAgentV3LegacyMetadata =
    | {
          type: 'response';
          vizConfigOutput: unknown;
          filtersOutput: unknown;
          metricQuery: unknown;
          savedQueryUuid: string | null;
          humanScore: number | null;
          humanFeedback: string | null;
          referencedArtifacts: AiAgentV3ReferencedArtifact[];
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

export type AiAgentV3ThreadLineage =
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

export type AiAgentV3Part = {
    uuid: string;
    type: AiAgentV3PartType;
    payloadVersion: number;
    payload: Record<string, unknown>;
    toolCallId: string | null;
    artifactVersionUuid: string | null;
};

export type AiAgentV3Context = {
    uuid: string;
    entityType: string;
    entityUuid: string | null;
    entityRef: string | null;
    pinnedVersionUuid: string | null;
    displayName: string | null;
    createdAt: string;
    runtimeOverrides:
        | AiChartRuntimeOverrides
        | AiDashboardRuntimeOverrides
        | null;
};

export type AiAgentV3Message = {
    uuid: string;
    role: 'user' | 'assistant' | 'compaction';
    parts: AiAgentV3Part[];
    metadata: {
        createdAt: string;
        createdByUserUuid: string | null;
        status: 'in_progress' | 'completed' | 'error' | 'canceled' | null;
        lastHeartbeatAt: string | null;
        modelConfig: AiAgentV3ModelConfig | null;
        tokenUsage: AiAgentV3TokenUsage | null;
        error: AiAgentV3RunError | null;
        hidden: boolean;
        context: AiAgentV3Context[];
        legacy: AiAgentV3LegacyMetadata | null;
    };
};

export type AiAgentV3Thread = AiAgentThreadCapability & {
    uuid: string;
    storageVersion: AiAgentStorageVersion;
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string | null;
    createdAt: string;
    updatedAt: string | null;
    createdFrom: AiThreadCreatedFrom;
    title: string | null;
    lineage: AiAgentV3ThreadLineage;
    messages: AiAgentV3Message[];
};

export type AiAgentV3ThreadSummary = AiAgentThreadCapability & {
    uuid: string;
    storageVersion: AiAgentStorageVersion;
    agentUuid: string;
    createdAt: string;
    createdFrom: AiThreadCreatedFrom;
    title: string | null;
    firstMessage: AiAgentThreadFirstMessage | null;
    user: { uuid: string | null; name: string };
};

export type ApiAiAgentV3ThreadResponse = {
    status: 'ok';
    results: AiAgentV3Thread;
};

export type ApiAiAgentV3ThreadSummaryListResponse = {
    status: 'ok';
    results: AiAgentV3ThreadSummary[];
};
