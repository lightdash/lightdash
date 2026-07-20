import {
    AdditionalMetric,
    AgentToolOutput,
    AiAgentDocumentContent,
    AiAgentDocumentSummary,
    AiAgentJudgeProjectContextEntry,
    AiArtifact,
    AiMetricQueryWithFilters,
    AiPromptSteer,
    AiWebAppPrompt,
    AiWritebackRunResult,
    AllChartsSearchResult,
    AnyType,
    CacheMetadata,
    CatalogField,
    ChartAsCode,
    CreateSchedulerAndTargetsWithoutIds,
    DashboardAsCode,
    DashboardSearchResult,
    DbtProjectType,
    Explore,
    FieldImpactReport,
    Filters,
    ItemsMap,
    KnexPaginateArgs,
    ParametersValuesMap,
    PreviewDeploySetupResult,
    ProjectType,
    SavedChart,
    SchedulerAndTargets,
    SlackPrompt,
    ToolFindContentArgs,
    ToolFindFieldsArgs,
    ToolListContentArgs,
    UpdateSlackResponse,
    UpdateWebAppResponse,
    WarehouseTablesCatalog,
    WarehouseTypes,
} from '@lightdash/common';
import {
    AiAgentFindContentCoverageEvent,
    AiAgentResponseStreamed,
    AiAgentToolCallEvent,
} from '../../../../analytics/LightdashAnalytics';
import { PostSlackFile } from '../../../../clients/Slack/SlackClient';
import { AiAgentSkill } from '../skills/types';

type Pagination = KnexPaginateArgs & {
    totalPageCount: number;
    totalResults: number;
};

export type AiAgentRequiredFilterMetadata = {
    fieldId: string;
    fieldRef: string;
    tableName: string;
    operator: string;
    values?: unknown[];
    settings?: unknown;
    required: boolean;
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
        requiredFilters?: AiAgentRequiredFilterMetadata[];
    }>;
    topMatchingFields?: Array<{
        name: string;
        label: string;
        tableName: string;
        fieldType: string;
        searchRank?: number;
        description?: string;
        chartUsage?: number;
        verifiedChartUsage?: number;
    }>;
}>;

// Project-wide verified-chart usage per field, keyed `table_field::fieldType`.
// Used to rank verified/governed fields first in grep discovery.
export type GetVerifiedFieldUsageFn = () => Promise<Map<string, number>>;

export type FindFieldResult = {
    fields: CatalogField[];
    pagination: Pagination | undefined;
};

export type FindFieldFn = (
    args: KnexPaginateArgs & {
        table: ToolFindFieldsArgs['table'];
        fieldSearchQuery: ToolFindFieldsArgs['fieldSearchQueries'][number];
        explore: Explore;
    },
) => Promise<FindFieldResult>;

export type FindFieldsSearchQuerySuccess = FindFieldResult & {
    status: 'success';
    searchQuery: string;
};

export type FindFieldsSearchQueryError = {
    status: 'error';
    searchQuery: string;
    error: string;
};

export type FindFieldsSearchQueryResult =
    | FindFieldsSearchQuerySuccess
    | FindFieldsSearchQueryError;

export type FindFieldsFn = (
    args: KnexPaginateArgs & {
        table: ToolFindFieldsArgs['table'];
        fieldSearchQueries: ToolFindFieldsArgs['fieldSearchQueries'];
        explore: Explore;
    },
) => Promise<FindFieldsSearchQueryResult[]>;

export type SearchSemanticLayerFn = (args: {
    searchQuery: string | null;
    type: 'metric' | 'dimension' | null;
    page: number;
    pageSize: number;
}) => Promise<{
    fields: Array<{
        name: string;
        label: string;
        tableName: string;
        fieldType: string;
        description?: string;
        chartUsage?: number;
        searchRank?: number;
    }>;
    pagination: Pagination | undefined;
}>;

export type AnalyzeFieldImpactFn = (args: {
    fieldId: string;
}) => Promise<FieldImpactReport>;

export type SyncDbtProjectResult = {
    status: 'success' | 'in_progress' | 'error';
    jobUuid: string;
    message: string;
};

export type SyncDbtProjectFn = (args: {
    reason: string | null;
}) => Promise<SyncDbtProjectResult>;

export type GetExploreFn = (args: { table: string }) => Promise<Explore>;

export type FindContentSpaceBreadcrumb = {
    uuid: string;
    name: string;
    slug: string;
};

export type FindContentSpaceMetadata = {
    uuid: string;
    name: string;
    slug: string;
    breadcrumbs: FindContentSpaceBreadcrumb[];
};

export type FindContentChartResult = AllChartsSearchResult & {
    contentType: 'chart';
    space: FindContentSpaceMetadata;
};

export type FindContentDashboardResult = DashboardSearchResult & {
    contentType: 'dashboard';
    space: FindContentSpaceMetadata;
};

export type FindContentSpaceResult = {
    contentType: 'space';
    uuid: string;
    name: string;
    slug: string;
    search_rank: number;
    chartCount: number;
    dashboardCount: number;
    childSpaceCount: number;
    appCount: number;
    directAccess: boolean;
    space: FindContentSpaceMetadata;
    verification: null;
};

export type FindContentResult =
    | FindContentChartResult
    | FindContentDashboardResult
    | FindContentSpaceResult;

export type FindContentFn = (args: {
    searchQuery: ToolFindContentArgs['searchQueries'][number];
    spaceSlug: ToolFindContentArgs['spaceSlug'];
}) => Promise<{
    content: FindContentResult[];
}>;

export type ListContentFn = (args: {
    spaceSlug: string | null;
    page: NonNullable<ToolListContentArgs['page']>;
}) => Promise<{
    spaceSlug: string | null;
    items: Array<
        | {
              contentType: 'chart' | 'dashboard' | 'data_app';
              name: string;
              slug: string;
              href: string;
          }
        | {
              contentType: 'space';
              name: string;
              slug: string;
              href: string;
              chartCount: number;
              dashboardCount: number;
              childSpaceCount: number;
              appCount: number;
              directAccess: boolean;
          }
    >;
    pagination:
        | {
              page: number;
              pageSize: number;
              totalResults: number;
              totalPageCount: number;
          }
        | undefined;
}>;

export type GetDashboardChartsFn = (args: {
    dashboardUuid: string;
    page: number;
    pageSize: number;
}) => Promise<{
    dashboardName: string;
    charts: DashboardSearchResult['charts'];
    pagination: {
        page: number;
        pageSize: number;
        totalResults: number;
        totalPageCount: number;
    };
}>;

export type ReadContentFn = (args: {
    slug: string;
    type: 'dashboard' | 'chart';
}) => Promise<
    | {
          type: 'dashboard';
          content: DashboardAsCode;
          href: string;
      }
    | {
          type: 'chart';
          content: ChartAsCode;
          href: string;
      }
>;

export type ResolveUrlFn = (args: {
    url: string;
}) => Promise<{ isShareLink: true; url: string } | { isShareLink: false }>;

export type EditContentFn = (args: {
    slug: string;
    type: 'dashboard' | 'chart';
    patch: unknown;
}) => Promise<
    | {
          type: 'dashboard';
          content: DashboardAsCode;
          uuid: string;
          href: string;
          versionUuids: {
              before: string | null;
              after: string | null;
          };
      }
    | {
          type: 'chart';
          content: ChartAsCode;
          uuid: string;
          href: string;
          versionUuids: {
              before: string | null;
              after: string | null;
          };
      }
>;

type CreateContentArgs =
    | {
          type: 'dashboard';
          content: DashboardAsCode;
      }
    | {
          type: 'chart';
          content: ChartAsCode;
      };

export type CreateContentFn = (args: CreateContentArgs) => Promise<
    | {
          type: 'dashboard';
          content: DashboardAsCode;
          uuid: string;
          href: string;
      }
    | {
          type: 'chart';
          content: ChartAsCode;
          uuid: string;
          href: string;
      }
>;

export type ValidateContentFn = (args: CreateContentArgs) => void;

export type CreateScheduledDeliveryFn = (args: {
    resourceType: 'chart' | 'dashboard';
    resourceUuidOrSlug: string;
    scheduler: CreateSchedulerAndTargetsWithoutIds;
    aiAugmentationPrompt: string | null;
}) => Promise<{
    scheduler: SchedulerAndTargets;
    resourceUuid: string;
    href: string;
    aiAugmentationAttached: boolean;
    warnings: string[];
}>;

export type UpdateUserNameFn = (args: {
    firstName: string;
    lastName: string;
}) => Promise<void>;

export type UpdateProgressFn = (
    progress: string,
    // The tool the progress belongs to. Web step-progress rendering uses this
    // to scope an inline progress row to the active tool, so a concurrently
    // running tool's message can't surface under another tool's header. Slack
    // ignores it (single pinned message). Omitted by tools that don't need
    // attribution.
    toolName?: string,
    progressId?: string,
    progressStatus?: 'in_progress' | 'complete' | 'error',
) => Promise<void>;

export type GetPromptFn = () => Promise<SlackPrompt | AiWebAppPrompt>;

export type RunAsyncQueryFn = (
    metricQuery: AiMetricQueryWithFilters,
    additionalMetrics?: AdditionalMetric[],
    parameters?: ParametersValuesMap,
) => Promise<{
    rows: Record<string, AnyType>[];
    cacheMetadata: CacheMetadata;
    fields: ItemsMap;
}>;

export type RunSavedChartQueryFn = (args: {
    chartUuid: string;
    dashboardSlug: string | null;
    limit: number | null;
}) => Promise<{
    rows: Record<string, AnyType>[];
    cacheMetadata: CacheMetadata;
    fields: ItemsMap;
}>;

export type GetSavedChartFn = (chartUuidOrSlug: string) => Promise<SavedChart>;

export type SendFileFn = (args: PostSlackFile) => Promise<string | undefined>;

export type SendSlackBlocksFn = (args: {
    channelId: string;
    threadTs: string;
    organizationUuid: string;
    text: string;
    blocks: AnyType[];
}) => Promise<{ ts: string }>;

export type UpdateSlackMessageFn = (args: {
    channelId: string;
    organizationUuid: string;
    ts: string;
    text: string;
    blocks: AnyType[];
}) => Promise<void>;

export type UpdatePromptFn = (
    prompt: UpdateWebAppResponse | UpdateSlackResponse,
) => Promise<void>;

export type StoreToolCallFn = (data: {
    promptUuid: string;
    toolCallId: string;
    toolName: string;
    toolArgs: object;
    mcpServerUuid?: string | null;
    parentToolCallId: string | null;
}) => Promise<void>;

// Persists tool-call attempts the AI SDK rejected before execution
// (schema-invalid args, unparsable JSON) — debugging aid, not shown in UI.
export type StoreToolCallErrorFn = (data: {
    promptUuid: string;
    toolCallId: string;
    toolName: string;
    errorMessage: string;
    rawArgs: string | null;
}) => Promise<void>;

export type StoreToolResultsFn = (
    data: Array<{
        promptUuid: string;
        toolCallId: string;
        toolName: string;
        result: string;
        metadata?: AgentToolOutput['metadata'] | Record<string, unknown> | null;
    }>,
) => Promise<void>;

export type StoreReasoningFn = (
    promptUuid: string,
    reasonings: Array<{
        reasoningId: string;
        text: string;
    }>,
) => Promise<void>;

export type IsPromptInterruptedFn = (promptUuid: string) => Promise<boolean>;

export type ConsumePromptSteersFn = (args: {
    promptUuid: string;
    stepNumber: number;
}) => Promise<AiPromptSteer[]>;

export type TrackEventFn = (
    event:
        | AiAgentResponseStreamed
        | AiAgentToolCallEvent
        | AiAgentFindContentCoverageEvent,
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

export type RunSqlJobFn = (args: { sql: string; limit: number }) => Promise<{
    rows: Record<string, AnyType>[];
    columns: string[];
    rowCount: number;
}>;

export type ListWarehouseTablesFn = () => Promise<WarehouseTablesCatalog>;

export type DescribeWarehouseTableFn = (args: {
    table: string;
    schema?: string;
}) => Promise<{
    columns: Array<{ name: string; type: string }>;
    resolvedSchema: string | null;
}>;

export type ListKnowledgeDocumentsFn = () => Promise<AiAgentDocumentSummary[]>;

export type GetKnowledgeDocumentContentFn = (args: {
    documentUuid: string;
}) => Promise<AiAgentDocumentContent>;

export type ReadPinnedThreadFn = (args: { threadUuid: string }) => Promise<
    {
        role: 'user' | 'assistant';
        message: string;
        createdAt: string;
    }[]
>;

export type WaitForSqlApprovalFn = (
    toolCallId: string,
    timeoutMs?: number,
) => Promise<'approved' | 'rejected' | 'timeout'>;

export type RecordSqlApprovalFn = (
    toolCallId: string,
    decision: 'approved' | 'rejected',
    decidedByUserUuid: string | null,
) => Promise<boolean>;

export type IsThreadSqlAutoApprovedFn = (
    threadUuid: string,
) => Promise<boolean>;

export type LoadAgentSkillFn = (
    name: string,
) => Promise<AiAgentSkill | undefined>;

export type EditDbtProjectFn = (args: {
    prompt: string;
    prUrl: string | null;
    /** Open a new PR instead of continuing the thread's existing one. */
    startNewPullRequest: boolean | null;
    progressId?: string;
}) => Promise<{
    aiWritebackRunUuid: string;
}>;

// Applies a structured project-context entry to lightdash.project_context.yml
// via the deterministic GitHub-API merge (no sandbox) and opens/updates a PR.
export type EditProjectContextFn = (
    entry: AiAgentJudgeProjectContextEntry,
) => Promise<{ prUrl: string; prAction: 'opened' | 'updated' }>;

/**
 * Make a code change to a writable repository and open/update a pull request,
 * via the general coding agent. The counterpart to {@link EditDbtProjectFn} for
 * non-dbt repos: no compile/preview step (verification lives in the PR's CI), so
 * it returns the base writeback result without the preview fields.
 */
export type EditRepoFn = (args: {
    repoTarget: string;
    prompt: string | null;
    prUrl: string | null;
    /** Open a new PR instead of continuing the repo's existing one in-thread. */
    startNewPullRequest: boolean | null;
    progressId?: string;
}) => Promise<AiWritebackRunResult>;

export type SetupPreviewDeployFn = () => Promise<PreviewDeploySetupResult>;

/**
 * Run one read-only shell command (ls/cat/find/grep/head/wc) against a repo
 * virtual filesystem and return combined stdout. With no `target` this reads the
 * project's dbt repo (subPath-scoped, as before); with an `"owner/repo"` target
 * it reads that whole repository on its default branch.
 */
export type ExploreRepoFn = (args: {
    command: string;
    target?: string | null;
}) => Promise<string>;

/**
 * List every repository the org's GitHub App installation can read, so the agent
 * can pick one to inspect with {@link ExploreRepoFn}.
 */
export type DiscoverReposFn = () => Promise<
    {
        owner: string;
        repo: string;
        defaultBranch: string;
        private: boolean;
    }[]
>;

/**
 * List the pull requests (workstreams) the current chat thread has opened with
 * {@link EditRepoFn}, so the agent can route a follow-up to the right one or
 * decide to open a new one. Optionally scoped to a single `owner/repo`.
 */
export type ListWorkstreamsFn = (args: {
    repoTarget: string | null;
}) => Promise<
    {
        repository: string;
        provider: string;
        prUrl: string;
        prNumber: number;
        summary: string | null;
    }[]
>;

/**
 * Close (without merging) a pull request the chat thread opened with
 * {@link EditRepoFn}. Thin wrapper over the same write-back close path the chat
 * PR card's "Close PR" button uses; the underlying service enforces
 * `manage:SourceCode` and that the URL targets this project's own repo.
 */
export type ClosePullRequestFn = (args: { prUrl: string }) => Promise<void>;

export type GetPullRequestDiffFn = (args: {
    prUrl: string;
}) => Promise<string | null>;

export type ListProjectsFn = () => Promise<
    {
        projectUuid: string;
        name: string;
        type: ProjectType;
        isActive: boolean;
    }[]
>;

// Safe, non-sensitive snapshot of the active project's dbt + warehouse setup.
// Deliberately excludes any credentials (tokens, keys, installation ids) and
// dbt environment variables, which can hold secrets.
export type GetProjectInfoFn = () => Promise<{
    projectName: string;
    projectType: ProjectType;
    dbtConnectionType: DbtProjectType;
    dbtVersion: string;
    warehouseType: WarehouseTypes | null;
    git: {
        repository: string;
        branch: string;
        projectSubPath: string;
        hostDomain: string | null;
    } | null;
    /**
     * Whether the git-backed repo deploys Lightdash preview projects via GitHub
     * Actions. Null when it can't be determined (not a git project, GitHub App
     * not installed, or the host has no preview-deploy support).
     */
    previewDeployCi: {
        hasPreviewDeployWorkflow: boolean;
        workflowPath: string | null;
    } | null;
}>;
