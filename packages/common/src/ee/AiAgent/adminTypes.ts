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
};

export type CreateAiOrganizationSettings = Omit<
    AiOrganizationSettings,
    'providerApiKeysSet'
> & {
    providerApiKeys?: UpdateAiProviderApiKeys;
};

export type UpdateAiOrganizationSettings = Partial<
    Omit<AiOrganizationSettings, 'organizationUuid' | 'providerApiKeysSet'>
> & {
    providerApiKeys?: UpdateAiProviderApiKeys;
};

export type ApiAiOrganizationSettingsResponse = ApiSuccess<
    AiOrganizationSettings & ComputedAiOrganizationSettings
>;

export type ApiUpdateAiOrganizationSettingsResponse =
    ApiSuccess<AiOrganizationSettings>;
