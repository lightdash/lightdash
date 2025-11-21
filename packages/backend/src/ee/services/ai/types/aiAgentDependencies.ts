import {
    AdditionalMetric,
    AgentToolOutput,
    AiArtifact,
    AiMetricQueryWithFilters,
    AiWebAppPrompt,
    AllChartsSearchResult,
    AnyType,
    CacheMetadata,
    CatalogField,
    CreateChangeParams,
    DashboardSearchResult,
    Explore,
    ExploreCompiler,
    Filters,
    ItemsMap,
    KnexPaginateArgs,
    SlackPrompt,
    ToolFindContentArgs,
    ToolFindFieldsArgs,
    UpdateSlackResponse,
    UpdateWebAppResponse,
} from '@lightdash/common';
import {
    AiAgentResponseStreamed,
    AiAgentToolCallEvent,
} from '../../../../analytics/LightdashAnalytics';
import { PostSlackFile } from '../../../../clients/Slack/SlackClient';

type Pagination = KnexPaginateArgs & {
    totalPageCount: number;
    totalResults: number;
};

export type ListExploresFn = () => Promise<Explore[]>;

export type FindExploresFn = (args: {
    fieldSearchSize: number;
    searchQuery?: string;
}) => Promise<{
    exploreSearchResults?: Array<{
        name: string;
        label: string;
        description?: string;
        aiHints?: string[];
        searchRank?: number;
        joinedTables?: string[] | null;
    }>;
    topMatchingFields?: Array<{
        name: string;
        label: string;
        tableName: string;
        fieldType: string;
        searchRank?: number;
        description?: string;
        chartUsage?: number;
    }>;
}>;

export type FindFieldFn = (
    args: KnexPaginateArgs & {
        table: ToolFindFieldsArgs['table'];
        fieldSearchQuery: ToolFindFieldsArgs['fieldSearchQueries'][number];
    },
) => Promise<{
    fields: CatalogField[];
    pagination: Pagination | undefined;
    explore?: Explore;
}>;

export type FindContentFn = (args: {
    searchQuery: ToolFindContentArgs['searchQueries'][number];
}) => Promise<{
    content: (AllChartsSearchResult | DashboardSearchResult)[];
}>;

export type UpdateProgressFn = (progress: string) => Promise<void>;

export type GetPromptFn = () => Promise<SlackPrompt | AiWebAppPrompt>;

export type RunMiniMetricQueryFn = (
    metricQuery: AiMetricQueryWithFilters,
    maxLimit: number,
    additionalMetrics?: AdditionalMetric[],
) => Promise<{
    rows: Record<string, AnyType>[];
    cacheMetadata: CacheMetadata;
    fields: ItemsMap;
}>;

export type SendFileFn = (args: PostSlackFile) => Promise<void>;

export type UpdatePromptFn = (
    prompt: UpdateWebAppResponse | UpdateSlackResponse,
) => Promise<void>;

export type StoreToolCallFn = (data: {
    promptUuid: string;
    toolCallId: string;
    toolName: string;
    toolArgs: object;
}) => Promise<void>;

export type StoreToolResultsFn = (
    data: Array<{
        promptUuid: string;
        toolCallId: string;
        toolName: string;
        result: string;
        metadata?: AgentToolOutput['metadata'];
    }>,
) => Promise<void>;

export type StoreReasoningFn = (
    promptUuid: string,
    reasonings: Array<{
        reasoningId: string;
        text: string;
    }>,
) => Promise<void>;

export type TrackEventFn = (
    event: AiAgentResponseStreamed | AiAgentToolCallEvent,
) => void;

export type SearchFieldValuesFn = (args: {
    table: string;
    fieldId: string;
    query: string;
    filters?: Filters;
}) => Promise<string[]>;

export type CreateOrUpdateArtifactFn = (data: {
    threadUuid: string;
    promptUuid: string;
    artifactType: 'chart' | 'dashboard';
    title?: string;
    description?: string;
    vizConfig: Record<string, unknown>;
}) => Promise<AiArtifact>;

export type CheckUserPermissionFn = (args: {
    userId: string;
    organizationId: string;
    permission: string;
}) => Promise<boolean>;

export type CreateChangeFn = (
    params: Pick<
        CreateChangeParams,
        'type' | 'entityName' | 'entityType' | 'entityTableName' | 'payload'
    >,
) => Promise<string>;

export type GetExploreCompilerFn = () => Promise<ExploreCompiler>;
