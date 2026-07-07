import type { ApiSuccess, KnexPaginatedData } from '../..';
import type {
    AiAgentSummary,
    AiAgentThreadSummary,
    AiAgentUser,
    AiModelOption,
} from './index';
import type { AiAgentModelConfig, AiThreadCreatedFrom } from './requestTypes';

export type AiAgentAdminFilters = {
    projectUuids?: string[];
    agentUuids?: string[];
    userUuids?: string[];
    createdFrom?: AiThreadCreatedFrom;
    humanScore?: number; // (-1, 0, 1)
    dateFrom?: string; // ISO date string
    dateTo?: string; // ISO date string
    search?: string; // Search by thread title
};

export type AiAgentAdminSortField = 'createdAt' | 'title';

export type AiAgentAdminSort = {
    field: AiAgentAdminSortField;
    direction: 'asc' | 'desc';
};

export type AiAgentAdminFeedbackSummary = {
    upvotes: number;
    downvotes: number;
    neutral: number;
    total: number;
};

type ThreadSummary = Pick<
    AiAgentThreadSummary<
        AiAgentUser & {
            slackUserId: string | null;
            email: string | null;
        }
    >,
    'user' | 'createdAt' | 'createdFrom' | 'title' | 'uuid'
>;

export type AiAgentAdminThreadSummary = ThreadSummary & {
    agent: Pick<AiAgentSummary, 'uuid' | 'name' | 'imageUrl'>;
    project: {
        uuid: string;
        name: string;
    };
    feedbackSummary: AiAgentAdminFeedbackSummary;
    promptCount: number;
    slackChannelId: string | null;
    slackThreadTs: string | null;
};

export type AiAgentAdminConversationsSummary = {
    threads: AiAgentAdminThreadSummary[];
};

export type ApiAiAgentAdminConversationsResponse = ApiSuccess<
    KnexPaginatedData<AiAgentAdminConversationsSummary>
>;

export type AiAgentAdminPromptActivityPoint = {
    date: string;
    promptCount: number;
};

export type ApiAiAgentAdminPromptActivityResponse = ApiSuccess<
    AiAgentAdminPromptActivityPoint[]
>;

export type McpActivityStatus = 'success' | 'error';

export type McpActivityFilters = {
    projectUuids?: string[];
    userUuids?: string[];
    agentUuids?: string[];
    toolNames?: string[];
    clientNames?: string[];
    status?: McpActivityStatus;
    dateFrom?: string; // ISO date string, inclusive
    // ISO date string, inclusive but compared as a timestamp: a date-only
    // value means midnight, excluding the rest of that day — send a full
    // timestamp to include it
    dateTo?: string;
};

export type McpActivitySortField = 'createdAt' | 'durationMs';

export type McpActivitySort = {
    field: McpActivitySortField;
    direction: 'asc' | 'desc';
};

export type McpActivityItem = {
    uuid: string;
    createdAt: string;
    user: {
        uuid: string;
        name: string;
        email: string | null;
    };
    project: {
        uuid: string;
        name: string;
    } | null;
    agent: {
        uuid: string;
        name: string;
    } | null;
    toolName: string;
    toolArgs: Record<string, unknown>;
    status: McpActivityStatus;
    errorMessage: string | null;
    durationMs: number;
    clientName: string | null;
    clientVersion: string | null;
    userAgent: string | null;
    authType: string;
    protocolVersion: string | null;
};

export type McpActivitySummary = {
    toolCalls: McpActivityItem[];
};

export type ApiMcpActivityResponse = ApiSuccess<
    KnexPaginatedData<McpActivitySummary>
>;

export type ComputedAiOrganizationSettings = {
    isCopilotEnabled: boolean;
    isTrial: boolean;
    defaultAiAgentModelOptions: AiModelOption[];
};

// AI Organization Settings Types
export const BYO_AI_PROVIDERS = ['anthropic', 'openai'] as const;
export type ByoAiProvider = (typeof BYO_AI_PROVIDERS)[number];

export type AiProviderApiKeysSet = {
    anthropic: boolean;
    openai: boolean;
};

export type AiProviderApiKeyHints = {
    anthropic: string | null;
    openai: string | null;
};

export type UpdateAiProviderApiKeys = {
    anthropic?: string | null;
    openai?: string | null;
};

export type AiOrganizationSettings = {
    organizationUuid: string;
    aiAgentsVisible: boolean;
    aiAgentReviewsEnabled: boolean;
    mcpContentWritesEnabled: boolean;
    defaultAiAgentModelConfig: AiAgentModelConfig | null;
    providerApiKeysSet: AiProviderApiKeysSet;
    providerApiKeyHints: AiProviderApiKeyHints;
};

export type CreateAiOrganizationSettings = Omit<
    AiOrganizationSettings,
    'providerApiKeysSet' | 'providerApiKeyHints'
> & {
    providerApiKeys?: UpdateAiProviderApiKeys;
};

export type UpdateAiOrganizationSettings = {
    aiAgentsVisible?: boolean;
    aiAgentReviewsEnabled?: boolean;
    mcpContentWritesEnabled?: boolean;
    defaultAiAgentModelConfig?: AiAgentModelConfig | null;
    providerApiKeys?: UpdateAiProviderApiKeys;
};

export type ApiAiOrganizationSettingsResponse = ApiSuccess<
    AiOrganizationSettings & ComputedAiOrganizationSettings
>;

export type ApiUpdateAiOrganizationSettingsResponse =
    ApiSuccess<AiOrganizationSettings>;
