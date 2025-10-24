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
    CatalogTable,
    ChangesetWithChanges,
    CreateChangeParams,
    DashboardSearchResult,
    Explore,
    ExploreCompiler,
    Filters,
    ItemsMap,
    KnexPaginateArgs,
    SearchResult,
    SlackPrompt,
    ToolFindChartsArgs,
    ToolFindContentArgs,
    ToolFindDashboardsArgs,
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
    exploreName: string;
    fieldSearchSize: number;
}) => Promise<{
    explore: Explore;
    catalogFields: {
        dimensions: CatalogField[];
        metrics: CatalogField[];
    };
}>;

export type FindFieldFn = (
    args: KnexPaginateArgs & {
        table: ToolFindFieldsArgs['table'];
        fieldSearchQuery: ToolFindFieldsArgs['fieldSearchQueries'][number];
    },
) => Promise<{
    fields: CatalogField[];
    pagination: Pagination | undefined;
}>;

export type FindDashboardsFn = (
    args: KnexPaginateArgs & {
        dashboardSearchQuery: ToolFindDashboardsArgs['dashboardSearchQueries'][number];
    },
) => Promise<{
    dashboards: DashboardSearchResult[];
    pagination: Pagination | undefined;
}>;

export type FindChartsFn = (
    args: KnexPaginateArgs & {
        chartSearchQuery: ToolFindChartsArgs['chartSearchQueries'][number];
    },
) => Promise<{
    charts: AllChartsSearchResult[];
    pagination: Pagination | undefined;
}>;

export type FindContentFn = (args: {
    searchQuery: ToolFindContentArgs['searchQueries'][number];
}) => Promise<{
    content: (AllChartsSearchResult | DashboardSearchResult)[];
}>;

export type GetExploreFn = (args: { exploreName: string }) => Promise<Explore>;

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
