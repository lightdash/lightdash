import { subject } from '@casl/ability';
import {
    AGENT_SUGGESTION_TOOLS,
    AgentSuggestion,
    AgentSummaryContext,
    AiAgent,
    AiAgentEvalRunJobPayload,
    AiAgentEvaluationRun,
    AiAgentEvaluationSummary,
    AiAgentNotFoundError,
    AiAgentProjectThreadSummary,
    AiAgentReviewClassifierEventType,
    AiAgentReviewRemediationRunJobPayload,
    AiAgentSummary,
    AiAgentThread,
    AiAgentThreadFilters,
    AiAgentThreadPullRequest,
    AiAgentThreadSummary,
    AiAgentUser,
    AiAgentUserPreferences,
    AiAgentVizConfig,
    AiAgentWithContext,
    AiDuplicateSlackPromptError,
    AiMcpCredentialScope,
    AiMcpGithubAvailability,
    AiMetricQueryWithFilters,
    AiModelOption,
    AiPromptContext,
    AiResultType,
    AiVizMetadata,
    AiWebAppPrompt,
    AiWritebackAttribution,
    AlreadyExistsError,
    AnyType,
    ApiAiAgentThreadCreateRequest,
    ApiAiAgentThreadMessageCreateRequest,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageVizQuery,
    ApiAiAgentThreadShareResponse,
    ApiAiMcpOAuthCredentialRequest,
    ApiAppendEvaluationRequest,
    ApiCreateAiAgent,
    ApiCreateAiMcpServer,
    ApiCreateEvaluationRequest,
    ApiUpdateAiAgent,
    ApiUpdateAiAgentMcpServerToolsRequest,
    ApiUpdateEvaluationRequest,
    ApiUpdateUserAgentPreferences,
    assertUnreachable,
    CommercialFeatureFlags,
    ContentType,
    DbtProjectType,
    derivePivotConfigurationFromChart,
    Explore,
    FeatureFlags,
    followUpToolsText,
    ForbiddenError,
    getErrorMessage,
    getGroupByDimensions,
    getItemId,
    getItemMap,
    getWebAiChartConfig,
    GITHUB_MCP_SERVER_NAME,
    GITHUB_MCP_SERVER_URL,
    isGitProjectType,
    isSlackPrompt,
    isToolProposeChangeSuccessResult,
    KnexPaginateArgs,
    KnexPaginatedData,
    LightdashUser,
    NotFoundError,
    NotImplementedError,
    OpenIdIdentity,
    OpenIdIdentityIssuerType,
    ParameterError,
    parseVizConfig,
    ProjectType,
    PullRequestProvider,
    QueryExecutionContext,
    ReadinessScore,
    ShareUrl,
    SlackPrompt,
    ToolDashboardArgs,
    toolDashboardArgsSchema,
    ToolDashboardV2Args,
    toolDashboardV2ArgsSchema,
    UpdateSlackResponse,
    UpdateWebAppResponse,
    validateAgentSuggestion,
    type AgentSuggestionTool,
    type AiPromptContextInput,
    type SessionUser,
    type SuggestionValidationCatalog,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { AllMiddlewareArgs, App, SlackEventMiddlewareArgs } from '@slack/bolt';
import { Block, KnownBlock, WebClient } from '@slack/web-api';
import { MessageElement } from '@slack/web-api/dist/response/ConversationsHistoryResponse';
import {
    APICallError,
    AssistantModelMessage,
    createUIMessageStream,
    ModelMessage,
    pipeUIMessageStreamToResponse,
    StreamTextResult,
    ToolCallPart,
    ToolModelMessage,
    UserModelMessage,
    type Output,
    type ToolSet,
} from 'ai';
import { EventEmitter } from 'events';
import _ from 'lodash';
import { nanoid as nanoidGenerator } from 'nanoid';
import slackifyMarkdown from 'slackify-markdown';
import { z } from 'zod';
import {
    AiAgentArtifactsRetrievedEvent,
    AiAgentArtifactVersionVerifiedEvent,
    AiAgentCreatedEvent,
    AiAgentDeletedEvent,
    AiAgentEvalAppendedEvent,
    AiAgentEvalCreatedEvent,
    AiAgentEvalRunEvent,
    AiAgentFindContentCoverageEvent,
    AiAgentPromptCreatedEvent,
    AiAgentPromptFeedbackEvent,
    AiAgentPullRequestViewedEvent,
    AiAgentResponseStreamed,
    AiAgentSuggestionsGeneratedEvent,
    AiAgentSuggestionSubmitEvent,
    AiAgentToolCallEvent,
    AiAgentUpdatedEvent,
    LightdashAnalytics,
} from '../../../analytics/LightdashAnalytics';
import { fromSession } from '../../../auth/account';
import {
    getInstallationToken,
    getPullRequest,
} from '../../../clients/github/Github';
import { type SlackClient } from '../../../clients/Slack/SlackClient';
import { LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import {
    CatalogModel,
    CatalogSearchContext,
} from '../../../models/CatalogModel/CatalogModel';
import { ChangesetModel } from '../../../models/ChangesetModel';
import { ContentVerificationModel } from '../../../models/ContentVerificationModel';
import { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { GroupsModel } from '../../../models/GroupsModel';
import { OpenIdIdentityModel } from '../../../models/OpenIdIdentitiesModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { PullRequestsModel } from '../../../models/PullRequestsModel';
import { SearchModel } from '../../../models/SearchModel';
import { SpaceModel } from '../../../models/SpaceModel';
import { UserAttributesModel } from '../../../models/UserAttributesModel';
import { UserModel } from '../../../models/UserModel';
import PrometheusMetrics from '../../../prometheus/PrometheusMetrics';
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import { CatalogService } from '../../../services/CatalogService/CatalogService';
import { CoderService } from '../../../services/CoderService/CoderService';
import { ContentService } from '../../../services/ContentService/ContentService';
import { DashboardService } from '../../../services/DashboardService/DashboardService';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { GithubAppService } from '../../../services/GithubAppService/GithubAppService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { SavedChartService } from '../../../services/SavedChartsService/SavedChartService';
import { SearchService } from '../../../services/SearchService/SearchService';
import { ShareService } from '../../../services/ShareService/ShareService';
import { SpaceService } from '../../../services/SpaceService/SpaceService';
import { wrapSentryTransaction } from '../../../utils';
import { validatePublicHttpUrl } from '../../../utils/ssrfProtection';
import { AiAgentDocumentModel } from '../../models/AiAgentDocumentModel';
import {
    AI_AGENT_MCP_SERVER_TOOL_PERMISSION_MODE_ALWAYS_ALLOW,
    AI_AGENT_MCP_SERVER_TOOL_PERMISSION_MODE_ALWAYS_DENY,
    AiAgentModel,
    type AiAgentMcpServerToolPermissionSetting,
    type AiAgentMcpServerToolPermissionSettingUpdate,
    type AiMcpCredential,
    type AiMcpServerWithSensitiveData,
} from '../../models/AiAgentModel';
import { AiAgentReviewClassifierModel } from '../../models/AiAgentReviewClassifierModel';
import { CommercialSlackAuthenticationModel } from '../../models/CommercialSlackAuthenticationModel';
import { ProjectContextModel } from '../../models/ProjectContextModel';
import { CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { selectAgent } from '../ai/agents/agentSelector';
import {
    generateAgentResponse,
    streamAgentResponse,
    type AgentMcpToolSetup,
} from '../ai/agents/agentV2';
import { generateCompactionSummary } from '../ai/agents/compactionGenerator';
import { generateEmbedding } from '../ai/agents/embeddingGenerator';
import { routeProjectForSlack } from '../ai/agents/projectRouter';
import { generateArtifactQuestion } from '../ai/agents/questionGenerator';
import { evaluateAgentReadiness } from '../ai/agents/readinessScorer';
import {
    generateAgentSuggestions,
    SUGGESTION_FALLBACK_CHIPS,
    type SuggestionPromptContext,
} from '../ai/agents/suggestionGenerator';
import { generateThreadTitle as generateTitleFromMessages } from '../ai/agents/titleGenerator';
import { AiAgentMcpRuntimeClient } from '../ai/AiAgentMcpRuntimeClient';
import { Compaction } from '../ai/compaction';
import {
    getAvailableModels,
    getCompactionModelMetadata,
    getDefaultModel,
    getModel,
} from '../ai/models';
import { matchesPreset } from '../ai/models/presets';
import { runRepoShellCommand } from '../ai/repoFs/bashShell';
import { createGithubRepoSource } from '../ai/repoFs/githubRepoSource';
import { RepoFs } from '../ai/repoFs/RepoFs';
import { markSlackThreadAutoApproved } from '../ai/tools/sqlApprovals';
import { AiAgentArgs, AiAgentDependencies } from '../ai/types/aiAgent';
import {
    EditDbtProjectFn,
    GetPromptFn,
    RepoShellFn,
    SendFileFn,
    SendSlackBlocksFn,
    StoreReasoningFn,
    StoreToolCallFn,
    StoreToolResultsFn,
    UpdateProgressFn,
    UpdateSlackMessageFn,
} from '../ai/types/aiAgentDependencies';
import { AiAgentContentValidation } from '../ai/utils/AiAgentContentValidation';
import { getUserFacingErrorMessage } from '../ai/utils/errorMessages';
import {
    getAgentConfirmationBlocks,
    getAgentSelectionBlocks,
    getArtifactBlocks,
    getDeepLinkBlocks,
    getEditDbtProjectBlocks,
    getFeedbackBlocks,
    getFollowUpToolBlocks,
    getMarkdownBlocks,
    getProjectSelectionBlocks,
    getProposeChangeBlocks,
    getReferencedArtifactsBlocks,
    getTextBlocks,
    getThinkingBlocks,
} from '../ai/utils/getSlackBlocks';
import { llmAsAJudge } from '../ai/utils/llmAsAJudge';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from '../ai/utils/populateCustomMetricsSQL';
import { validateSelectedFieldsExistence } from '../ai/utils/validators';
import { AiAgentToolsService } from '../AiAgentToolsService/AiAgentToolsService';
import { AiOrganizationSettingsService } from '../AiOrganizationSettingsService';
import { AiWritebackService } from '../AiWritebackService/AiWritebackService';
import { buildChangesetWritebackPrompt } from '../AiWritebackService/changesetPrompt';
import type { AiWritebackSource } from '../AiWritebackService/types';
import { type WritebackPreviewService } from '../AiWritebackService/WritebackPreviewService';
import { PreviewDeploySetupService } from '../PreviewDeploySetupService/PreviewDeploySetupService';
import { canGeneratePostResponseSuggestions } from './suggestionAccess';

type ThreadMessageContext = Array<
    Required<Pick<MessageElement, 'text' | 'user' | 'ts'>>
>;

type ThreadCompaction = NonNullable<
    Awaited<ReturnType<AiAgentModel['findLatestThreadCompaction']>>
>;

type AgentResponseStream = {
    pipeUIMessageStreamToResponse: (
        response: Parameters<
            typeof pipeUIMessageStreamToResponse
        >[0]['response'],
    ) => void;
    consumeStream: StreamTextResult<ToolSet, Output.Output>['consumeStream'];
};

const MAX_AI_PROMPT_CONTEXT_ITEMS = 10;

// Web (SSE) agent streams are kept warm with a transient keepalive chunk on
// this interval. A long, output-silent tool call — notably AI writeback, whose
// sandbox/agent stage can run for minutes with no streamed tokens — otherwise
// lets the connection idle long enough for an intermediary (the GCP HTTPS load
// balancer) to drop it, which the client surfaces as a spurious "something went
// wrong" even though the backend job completes and opens the PR. 15s sits
// comfortably under the usual 30-60s idle timeouts.
const STREAM_KEEPALIVE_INTERVAL_MS = 15_000;

type AiAgentServiceDependencies = {
    aiAgentModel: AiAgentModel;
    aiAgentDocumentModel: AiAgentDocumentModel;
    projectContextModel: ProjectContextModel;
    analytics: LightdashAnalytics;
    asyncQueryService: AsyncQueryService;
    catalogService: CatalogService;
    catalogModel: CatalogModel;
    changesetModel: ChangesetModel;
    contentVerificationModel: ContentVerificationModel;
    searchModel: SearchModel;
    searchService: SearchService;
    featureFlagService: FeatureFlagService;
    groupsModel: GroupsModel;
    lightdashConfig: LightdashConfig;
    openIdIdentityModel: OpenIdIdentityModel;
    projectService: ProjectService;
    schedulerClient: CommercialSchedulerClient;
    slackAuthenticationModel: CommercialSlackAuthenticationModel;
    slackClient: SlackClient;
    userAttributesModel: UserAttributesModel;
    userModel: UserModel;
    spaceService: SpaceService;
    spaceModel: SpaceModel;
    projectModel: ProjectModel;
    coderService: CoderService;
    dashboardService: DashboardService;
    savedChartService: SavedChartService;
    contentService: ContentService;
    aiOrganizationSettingsService: AiOrganizationSettingsService;
    shareService: ShareService;
    aiAgentContentValidation: AiAgentContentValidation;
    aiWritebackService: AiWritebackService;
    previewDeploySetupService: PreviewDeploySetupService;
    writebackPreviewService: WritebackPreviewService;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    githubAppService: GithubAppService;
    aiAgentToolsService: AiAgentToolsService;
    pullRequestsModel: Pick<PullRequestsModel, 'findByAiThreadUuid' | 'find'>;
    aiAgentReviewClassifierModel: Pick<
        AiAgentReviewClassifierModel,
        'findReviewRemediationByPreviewThread'
    >;
    prometheusMetrics?: PrometheusMetrics;
};

export type RelevantVerifiedAnswer = {
    artifactVersionUuid: string;
    chartConfig: Record<string, unknown>;
    artifactType: 'chart' | 'dashboard';
    verifiedQuestion: string | null;
    title: string | null;
    description: string | null;
    similarity: number;
};

export type RelevantVerifiedAnswerContext = {
    relevantVerifiedAnswers: RelevantVerifiedAnswer[];
};

// Cache for OAuth response URLs, keyed by "teamId-channelId-messageTs"
// Used to update the ephemeral "Redirected to Lightdash..." message after OAuth completes
// Entries auto-expire after 10 minutes
const oauthResponseUrlCache = new Map<
    string,
    { responseUrl: string; timestamp: number }
>();
const OAUTH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getOAuthCacheKey(
    teamId: string,
    channelId: string,
    messageTs: string,
): string {
    return `${teamId}-${channelId}-${messageTs}`;
}

function cleanupOAuthCache(): void {
    const now = Date.now();
    oauthResponseUrlCache.forEach((value, key) => {
        if (now - value.timestamp > OAUTH_CACHE_TTL_MS) {
            oauthResponseUrlCache.delete(key);
        }
    });
}

const CLARIFYING_QUESTION_RE =
    /(\?\s*$)|(could you clarify)|(did you mean)|(which (one|of these))|(let me know which)|(what would you like)/i;

const REFUSAL_RE =
    /(doesn't have)|(does not have)|(couldn't (find|locate))|(could not (find|locate))|(no .{0,40}(field|data|column|metric|dimension))|(not available)|(doesn't seem to)|(does not seem to)|(unable to)|(i can't)|(i cannot)|(this dataset)/i;

/**
 * The built-in "system" agent used as a fallback when an organization has no
 * configured agents (gated behind the AiSlackSystemAgentFallback feature
 * flag). It answers data questions with the normal query/find tools, and —
 * because the run path attaches the `editDbtProject` tool whenever
 * AiWriteback is enabled — it routes dbt/semantic-layer change requests to
 * the AI writeback flow.
 */
const SYSTEM_AGENT_NAME = 'Lightdash Assistant';
const SYSTEM_AGENT_INSTRUCTION = `You are Lightdash's built-in assistant. Help the user explore their data by using your query and find tools to answer questions about metrics, dimensions, charts, and dashboards.

If the user asks about the current project or its underlying dbt project — for example which dbt project this is, which git repository or branch it connects to, or what dbt version or warehouse it uses — call the getProjectInfo tool and answer from its result. Do not guess these details.

If the user asks you to change the dbt project or semantic layer — for example renaming or adding a metric or dimension, editing a model's YAML, or otherwise modifying definitions — use the editDbtProject tool, passing along the user's request. It opens a pull request against the project's dbt repository. Do not attempt to make such changes any other way. If the user asks to write back or open a pull request from their changeset(s), call editDbtProject with fromActiveChangeset set to true and prompt set to null — the server builds the change instructions from the project's active changeset.

If the user asks to set up Lightdash preview deploys / preview projects for pull requests (or they accept the offer surfaced after a writeback), use the setupPreviewDeploy tool. It opens a separate pull request adding the Lightdash preview GitHub Actions workflow; a prior writeback is not required.

After a writeback, tell the user which Lightdash project and which GitHub repository the change was made against (the tool result includes both), so they can confirm it went to the right place.`;

function detectClarifyingQuestion(text: string): boolean {
    return CLARIFYING_QUESTION_RE.test(text);
}

function detectRefusal(text: string): boolean {
    return REFUSAL_RE.test(text);
}

// Find the explore the agent's most recent query-producing tool call hit.
// Returns a compact slice of its fields (labels) so the suggestion prompt can
// stay grounded in fields the agent JUST used instead of the full catalogue.
function extractLatestQueryExplore(
    toolCalls: ReadonlyArray<{ toolArgs: object }>,
    availableExplores: Explore[],
): NonNullable<
    SuggestionPromptContext['thread']
>['latestAssistantTurn']['latestQueryExplore'] {
    for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
        const args = toolCalls[i]?.toolArgs as
            | { exploreName?: unknown }
            | undefined;
        if (args && typeof args.exploreName === 'string') {
            const explore = availableExplores.find(
                (e) => e.name === args.exploreName,
            );
            if (explore) {
                const baseTable = explore.tables[explore.baseTable];
                return {
                    name: explore.name,
                    label: explore.label,
                    description: baseTable.description ?? null,
                    dimensions: Object.values(baseTable.dimensions).map(
                        (d) => ({
                            id: getItemId(d),
                            label: d.label,
                        }),
                    ),
                    metrics: Object.values(baseTable.metrics).map((m) => ({
                        id: getItemId(m),
                        label: m.label,
                    })),
                };
            }
        }
    }
    return null;
}

function validateGeneratedSuggestion(
    chip: AgentSuggestion,
    catalog: SuggestionValidationCatalog,
    availableExplores: Explore[],
    enabledTools: AgentSuggestionTool[],
) {
    const result = validateAgentSuggestion(chip, catalog);
    if (!result.valid || chip.kind === 'navigate') {
        return result;
    }

    if (!enabledTools.includes(chip.tool)) {
        return {
            valid: false as const,
            reason: `disabled tool "${chip.tool}"`,
        };
    }

    const { explore: exploreName, dimensions, metrics } = chip.defaults;
    const selectedFields = [...dimensions, ...metrics];
    if (!exploreName || selectedFields.length === 0) {
        return result;
    }

    const explore = availableExplores.find((e) => e.name === exploreName);
    if (!explore) {
        return result;
    }

    try {
        validateSelectedFieldsExistence(explore, selectedFields);
        return result;
    } catch (error) {
        return {
            valid: false as const,
            reason:
                error instanceof Error
                    ? error.message
                    : `unknown dimensions for explore "${exploreName}"`,
        };
    }
}

export class AiAgentService extends BaseService {
    private readonly aiAgentModel: AiAgentModel;

    private readonly aiAgentDocumentModel: AiAgentDocumentModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly githubAppService: GithubAppService;

    private readonly projectContextModel: ProjectContextModel;

    private readonly analytics: LightdashAnalytics;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly catalogService: CatalogService;

    private readonly catalogModel: CatalogModel;

    private readonly changesetModel: ChangesetModel;

    private readonly contentVerificationModel: ContentVerificationModel;

    private readonly featureFlagService: FeatureFlagService;

    private readonly groupsModel: GroupsModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly openIdIdentityModel: OpenIdIdentityModel;

    private readonly projectService: ProjectService;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly slackAuthenticationModel: CommercialSlackAuthenticationModel;

    private readonly slackClient: SlackClient;

    private readonly userAttributesModel: UserAttributesModel;

    private readonly searchModel: SearchModel;

    private readonly searchService: SearchService;

    private readonly userModel: UserModel;

    private readonly spaceService: SpaceService;

    private readonly spaceModel: SpaceModel;

    private readonly projectModel: ProjectModel;

    private readonly coderService: CoderService;

    private readonly dashboardService: DashboardService;

    private readonly savedChartService: SavedChartService;

    private readonly contentService: ContentService;

    private readonly prometheusMetrics?: PrometheusMetrics;

    private readonly aiOrganizationSettingsService: AiOrganizationSettingsService;

    private readonly shareService: ShareService;

    private readonly aiAgentContentValidation: AiAgentContentValidation;

    private readonly aiWritebackService: AiWritebackService;

    private readonly previewDeploySetupService: PreviewDeploySetupService;

    private readonly writebackPreviewService: WritebackPreviewService;

    private readonly aiAgentToolsService: AiAgentToolsService;

    private readonly pullRequestsModel: Pick<
        PullRequestsModel,
        'findByAiThreadUuid' | 'find'
    >;

    private readonly aiAgentReviewClassifierModel: Pick<
        AiAgentReviewClassifierModel,
        'findReviewRemediationByPreviewThread'
    >;

    private readonly aiAgentMcpRuntimeClient: AiAgentMcpRuntimeClient;

    private static getPinnedContextAnalyticsProperties(
        context: AiPromptContextInput | undefined,
    ): Pick<
        AiAgentPromptCreatedEvent['properties'],
        | 'hasPinnedContext'
        | 'pinnedContextCount'
        | 'pinnedChartCount'
        | 'pinnedDashboardCount'
    > {
        const pinnedChartCount =
            context?.filter((item) => item.type === 'chart').length ?? 0;
        const pinnedDashboardCount =
            context?.filter((item) => item.type === 'dashboard').length ?? 0;
        const pinnedThreadCount =
            context?.filter((item) => item.type === 'thread').length ?? 0;
        const pinnedContextCount =
            pinnedChartCount + pinnedDashboardCount + pinnedThreadCount;

        return {
            hasPinnedContext: pinnedContextCount > 0,
            pinnedContextCount,
            pinnedChartCount,
            pinnedDashboardCount,
        };
    }

    private async validatePromptContextAccess(
        user: SessionUser,
        agent: AiAgent,
        context: AiPromptContextInput | undefined,
    ): Promise<AiPromptContextInput | undefined> {
        if (!context || context.length === 0) return undefined;

        const seen = new Set<string>();
        const deduped = context.filter((item) => {
            let key: string;
            switch (item.type) {
                case 'chart':
                    key = `chart:${item.chartUuid}`;
                    break;
                case 'dashboard':
                    key = `dashboard:${item.dashboardUuid}`;
                    break;
                case 'thread':
                    key = `thread:${item.threadUuid}`;
                    break;
                default:
                    return assertUnreachable(
                        item,
                        'Unknown AiPromptContextItemInput type',
                    );
            }
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        if (deduped.length > MAX_AI_PROMPT_CONTEXT_ITEMS) {
            throw new ParameterError(
                `You can attach up to ${MAX_AI_PROMPT_CONTEXT_ITEMS} items as context`,
            );
        }

        await Promise.all(
            deduped.map((item) => {
                if (item.type === 'chart') {
                    return this.savedChartService.hasAccess(
                        'view',
                        { user, projectUuid: agent.projectUuid },
                        { savedChartUuid: item.chartUuid },
                    );
                }

                if (item.type === 'thread') {
                    return this.validateThreadContextAccess(user, item);
                }

                return this.dashboardService.hasAccess(
                    'view',
                    { user, projectUuid: agent.projectUuid },
                    { dashboardUuid: item.dashboardUuid },
                );
            }),
        );

        return deduped;
    }

    // A pinned thread may live in another project (e.g. verifying a fix in a
    // preview environment against the original conversation), so access is
    // checked against the source thread's own agent.
    private async validateThreadContextAccess(
        user: SessionUser,
        item: { threadUuid: string },
    ): Promise<void> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        const ownership = await this.aiAgentModel.findThreadOwnership({
            organizationUuid,
            threadUuid: item.threadUuid,
        });
        if (!ownership || !ownership.agentUuid) {
            throw new NotFoundError(`Thread not found: ${item.threadUuid}`);
        }
        const threadAgent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid: ownership.agentUuid,
        });
        if (!threadAgent) {
            throw new NotFoundError(`Thread not found: ${item.threadUuid}`);
        }
        const hasAccess = await this.checkAgentThreadAccess(
            user,
            threadAgent,
            ownership.ownerUserUuid ?? '',
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to attach this conversation as context',
            );
        }
    }

    constructor(dependencies: AiAgentServiceDependencies) {
        super();
        this.aiAgentModel = dependencies.aiAgentModel;
        this.aiAgentDocumentModel = dependencies.aiAgentDocumentModel;
        this.projectContextModel = dependencies.projectContextModel;
        this.analytics = dependencies.analytics;
        this.asyncQueryService = dependencies.asyncQueryService;
        this.catalogService = dependencies.catalogService;
        this.catalogModel = dependencies.catalogModel;
        this.changesetModel = dependencies.changesetModel;
        this.contentVerificationModel = dependencies.contentVerificationModel;
        this.searchModel = dependencies.searchModel;
        this.searchService = dependencies.searchService;
        this.featureFlagService = dependencies.featureFlagService;
        this.groupsModel = dependencies.groupsModel;
        this.lightdashConfig = dependencies.lightdashConfig;
        this.openIdIdentityModel = dependencies.openIdIdentityModel;
        this.projectService = dependencies.projectService;
        this.schedulerClient = dependencies.schedulerClient;
        this.slackAuthenticationModel = dependencies.slackAuthenticationModel;
        this.slackClient = dependencies.slackClient;
        this.userAttributesModel = dependencies.userAttributesModel;
        this.userModel = dependencies.userModel;
        this.spaceService = dependencies.spaceService;
        this.spaceModel = dependencies.spaceModel;
        this.projectModel = dependencies.projectModel;
        this.coderService = dependencies.coderService;
        this.dashboardService = dependencies.dashboardService;
        this.savedChartService = dependencies.savedChartService;
        this.contentService = dependencies.contentService;
        this.prometheusMetrics = dependencies.prometheusMetrics;
        this.aiOrganizationSettingsService =
            dependencies.aiOrganizationSettingsService;
        this.shareService = dependencies.shareService;
        this.aiAgentContentValidation = dependencies.aiAgentContentValidation;
        this.aiWritebackService = dependencies.aiWritebackService;
        this.previewDeploySetupService = dependencies.previewDeploySetupService;
        this.writebackPreviewService = dependencies.writebackPreviewService;
        this.githubAppInstallationsModel =
            dependencies.githubAppInstallationsModel;
        this.githubAppService = dependencies.githubAppService;
        this.aiAgentToolsService = dependencies.aiAgentToolsService;
        this.pullRequestsModel = dependencies.pullRequestsModel;
        this.aiAgentReviewClassifierModel =
            dependencies.aiAgentReviewClassifierModel;
        this.aiAgentMcpRuntimeClient = new AiAgentMcpRuntimeClient({
            aiAgentModel: this.aiAgentModel,
            lightdashConfig: this.lightdashConfig,
        });
    }

    private enqueueReviewClassifierEvent(args: {
        eventType: AiAgentReviewClassifierEventType;
        organizationUuid: string | null | undefined;
        projectUuid: string | null | undefined;
        agentUuid: string | null | undefined;
        threadUuid: string | null | undefined;
        promptUuid: string;
        userUuid?: string | null;
    }) {
        const { organizationUuid, projectUuid, agentUuid, threadUuid } = args;
        if (!organizationUuid || !projectUuid || !agentUuid || !threadUuid) {
            return;
        }

        const userUuid = args.userUuid ?? 'system';

        void this.aiOrganizationSettingsService
            .isAiAgentReviewsEnabled({ organizationUuid })
            .then(async (reviewsEnabled) => {
                if (!reviewsEnabled) {
                    return undefined;
                }
                return this.schedulerClient.aiAgentReviewClassifier({
                    eventType: args.eventType,
                    organizationUuid,
                    projectUuid,
                    agentUuid,
                    threadUuid,
                    promptUuid: args.promptUuid,
                    userUuid,
                });
            })
            .catch((error) => {
                Logger.error(
                    'Failed to enqueue AI agent review classifier job',
                    error,
                );
            });
    }

    private getIsVerifiedArtifactsEnabled(): boolean {
        return this.lightdashConfig.ai.copilot.embeddingEnabled;
    }

    private async getIsCopilotEnabled(
        user: Pick<
            LightdashUser,
            'userUuid' | 'organizationUuid' | 'organizationName'
        >,
    ) {
        const aiCopilotFlag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });

        if (aiCopilotFlag.enabled) {
            return true;
        }
        if (!user.organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        const isEligibleForTrial =
            await this.aiOrganizationSettingsService.isEligibleForTrial(
                aiCopilotFlag.enabled,
                user.organizationUuid,
            );

        return isEligibleForTrial;
    }

    /**
     * Checks if a user has access to an AI agent
     * Returns true if:
     * 1. The user can manage the AiAgent (admin access)
     * 2. The agent has no group or user access defined (open access - users that can view AiAgent)
     * 3. The user is a member of at least one of the agent's groups
     * 4. The user is in the agent's user access list
     */
    private async checkAgentAccess(
        user: SessionUser,
        agent: AiAgent,
    ): Promise<boolean> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid: agent.organizationUuid,
                    projectUuid: agent.projectUuid,
                    metadata: {
                        agentUuid: agent.uuid,
                        agentName: agent.name,
                    },
                }),
            )
        ) {
            return true;
        }

        // Check if open access (no restrictions)
        const hasGroupAccess =
            agent.groupAccess && agent.groupAccess.length > 0;
        const hasUserAccess = agent.userAccess && agent.userAccess.length > 0;

        if (!hasGroupAccess && !hasUserAccess) {
            return auditedAbility.can(
                'view',
                subject('Project', {
                    organizationUuid: agent.organizationUuid,
                    projectUuid: agent.projectUuid,
                }),
            );
        }

        // Check user access first (direct access)
        if (hasUserAccess && agent.userAccess.includes(user.userUuid)) {
            return true;
        }

        // Check group access
        if (hasGroupAccess) {
            const groupUuids = agent.groupAccess;
            const userGroups = await this.groupsModel.findUserInGroups({
                userUuid: user.userUuid,
                organizationUuid: agent.organizationUuid,
                groupUuids,
            });

            if (userGroups.length > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * Checks if user has access to view/interact with agent threads
     * Returns true if:
     * 1. The user has group access to the agent
     * 2. The user is the thread owner
     * 3. The user has manage permissions for the agent
     */
    /**
     * The writeback PR a thread is associated with — the PR the agent opened
     * in this thread, or (for remediation verification threads) the PR being
     * verified. Live fields (title/state/counts) are best-effort from GitHub;
     * the stored summary renders without them. Null when the thread has no PR.
     */
    async getThreadPullRequest(
        user: SessionUser,
        agentUuid: string,
        threadUuid: string,
    ): Promise<AiAgentThreadPullRequest | null> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });
        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }
        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });
        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }
        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to view this thread',
            );
        }

        let pullRequest =
            await this.pullRequestsModel.findByAiThreadUuid(threadUuid);
        if (!pullRequest) {
            const remediation =
                await this.aiAgentReviewClassifierModel.findReviewRemediationByPreviewThread(
                    { organizationUuid, previewThreadUuid: threadUuid },
                );
            if (remediation?.pullRequestUuid) {
                pullRequest = await this.pullRequestsModel.find(
                    remediation.pullRequestUuid,
                );
            }
        }
        if (!pullRequest) {
            return null;
        }

        const result: AiAgentThreadPullRequest = {
            prUrl: pullRequest.prUrl,
            repo: `${pullRequest.owner}/${pullRequest.repo}`,
            prNumber: pullRequest.prNumber,
            title: null,
            summary: pullRequest.summary,
            state: null,
            additions: null,
            deletions: null,
            changedFiles: null,
            commitSha: null,
        };

        try {
            if (pullRequest.provider === PullRequestProvider.GITHUB) {
                const installationId =
                    await this.githubAppInstallationsModel.findInstallationId(
                        organizationUuid,
                    );
                if (installationId) {
                    const pr = await getPullRequest({
                        owner: pullRequest.owner,
                        repo: pullRequest.repo,
                        pullNumber: pullRequest.prNumber,
                        installationId,
                    });
                    result.title = pr.title;
                    result.state = pr.merged ? 'merged' : pr.state;
                    result.additions = pr.additions;
                    result.deletions = pr.deletions;
                    result.changedFiles = pr.changedFiles;
                }
            }
        } catch (error) {
            this.logger.warn(
                `Failed to resolve live PR state for thread ${threadUuid}: ${getErrorMessage(error)}`,
            );
        }

        return { ...result, summary: result.summary ?? result.title };
    }

    private async checkAgentThreadAccess(
        user: SessionUser,
        agent: AiAgent,
        threadUserUuid: string,
    ): Promise<boolean> {
        const hasAccess = await this.checkAgentAccess(user, agent);
        if (!hasAccess) {
            return false;
        }

        if (threadUserUuid === user.userUuid) {
            return true;
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid: agent.organizationUuid,
                    projectUuid: agent.projectUuid,
                    metadata: {
                        agentUuid: agent.uuid,
                        agentName: agent.name,
                    },
                }),
            )
        ) {
            return true;
        }

        return false;
    }

    async getAvailableExplores(
        user: SessionUser,
        projectUuid: string,
        availableTags: string[] | null,
        exploreNames?: string[],
    ) {
        return this.aiAgentToolsService.getAvailableExplores({
            user,
            projectUuid,
            availableTags,
            exploreNames,
        });
    }

    private async getExplore(
        user: SessionUser,
        projectUuid: string,
        availableTags: string[] | null,
        exploreName: string,
    ) {
        return this.aiAgentToolsService.getExplore({
            user,
            projectUuid,
            availableTags,
            exploreName,
        });
    }

    public async getAgentExploreAccessSummary(
        user: SessionUser,
        projectUuid: string,
        tags: string[] | null,
    ) {
        const { organizationUuid } = user;

        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const availableExplores = await this.getAvailableExplores(
            user,
            projectUuid,
            tags,
        );

        const exploreAccessSummary = availableExplores.map((explore) => ({
            exploreName: explore.label,
            joinedTables: explore.joinedTables.map(
                (table) => explore.tables[table.table].label,
            ),
            dimensions: Object.values(
                explore.tables[explore.baseTable].dimensions,
            ).map((dimension) => dimension.label),
            metrics: Object.values(
                explore.tables[explore.baseTable].metrics,
            ).map((metric) => metric.label),
        }));

        return exploreAccessSummary;
    }

    public async getAgentSuggestions(
        user: SessionUser,
        {
            projectUuid,
            agentUuid,
            threadUuid,
            afterMessageUuid,
            enableSqlMode = false,
        }: {
            projectUuid: string;
            agentUuid: string;
            threadUuid?: string;
            afterMessageUuid?: string;
            enableSqlMode?: boolean;
        },
    ): Promise<{ chips: AgentSuggestion[] }> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const featureEnabled = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.AiAgentSuggestions,
        });
        if (!featureEnabled.enabled) {
            return { chips: [] };
        }

        const agent = await this.getAgent(user, agentUuid, projectUuid);

        if (threadUuid) {
            const thread = await this.aiAgentModel.getThread({
                organizationUuid,
                agentUuid,
                threadUuid,
            });

            if (!thread) {
                throw new NotFoundError(`Thread not found: ${threadUuid}`);
            }

            if (!canGeneratePostResponseSuggestions(user.userUuid, thread)) {
                return { chips: [] };
            }
        }

        const auditedAbility = this.createAuditedAbility(user);
        const canRunSql =
            enableSqlMode &&
            auditedAbility.can(
                'manage',
                subject('SqlRunner', {
                    organizationUuid,
                    projectUuid,
                    metadata: {
                        agentUuid,
                        threadUuid,
                    },
                }),
            );
        const enabledTools = AGENT_SUGGESTION_TOOLS.filter((tool) => {
            if (tool === 'runSql') return canRunSql;
            return true;
        });

        const availableExplores = await this.getAvailableExplores(
            user,
            projectUuid,
            agent.tags,
        );

        const explores = availableExplores.slice(0, 12).map((explore) => {
            const baseTable = explore.tables[explore.baseTable];
            return {
                name: explore.name,
                label: explore.label,
                description: baseTable.description ?? null,
                dimensions: Object.values(baseTable.dimensions)
                    .slice(0, 8)
                    .map((d) => ({
                        id: getItemId(d),
                        label: d.label,
                    })),
                metrics: Object.values(baseTable.metrics)
                    .slice(0, 8)
                    .map((m) => ({
                        id: getItemId(m),
                        label: m.label,
                    })),
            };
        });

        const verifiedQuestionsData =
            await this.aiAgentModel.getVerifiedQuestions(agentUuid);
        const verifiedQuestions = verifiedQuestionsData
            .slice(0, 6)
            .map((q) => q.question);

        const verifiedContent = await this.fetchSuggestionsVerifiedContent(
            user,
            projectUuid,
        );

        const recentUserConversations = threadUuid
            ? undefined
            : await this.fetchSuggestionsRecentConversations({
                  organizationUuid,
                  agentUuid,
                  userUuid: user.userUuid,
              });

        const threadContext = threadUuid
            ? await this.buildSuggestionsThreadContext({
                  organizationUuid,
                  threadUuid,
                  afterMessageUuid,
                  availableExplores,
              })
            : null;

        const validationCatalog: SuggestionValidationCatalog = {
            exploreNames: new Set(availableExplores.map((e) => e.name)),
        };

        const startedAt = Date.now();
        let chips: AgentSuggestion[] = SUGGESTION_FALLBACK_CHIPS;
        let usingFallback = true;
        let modelId = 'fallback';

        try {
            const modelOptions = getModel(this.lightdashConfig.ai.copilot, {
                enableReasoning: false,
                useFastModel: true,
            });

            const generated = await generateAgentSuggestions(
                modelOptions,
                {
                    agentName: agent.name,
                    agentInstruction: agent.instruction,
                    canManageContent: agent.enableContentTools,
                    enabledTools,
                    explores,
                    verifiedQuestions,
                    verifiedContentTags: agent.tags ?? [],
                    verifiedContent,
                    recentUserConversations,
                    thread: threadContext ?? undefined,
                },
                {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    agentId: agentUuid,
                    mode: threadContext ? 'post-response' : 'empty-state',
                },
            );

            const dropped: string[] = [];
            // Resolve model-side intent into final wire shape. Navigate chips
            // carry a recentConversationIndex from the LLM; the server turns
            // that into a real thread URL using the conversations array we
            // built earlier (which has the UUIDs the LLM never sees).
            const resolved: AgentSuggestion[] = [];
            for (const chip of generated.chips) {
                if (chip.kind === 'prompt') {
                    resolved.push(chip);
                } else {
                    const conv =
                        recentUserConversations?.[chip.recentConversationIndex];
                    if (conv) {
                        resolved.push({
                            kind: 'navigate',
                            label: chip.label,
                            url: `/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${conv.threadUuid}`,
                        });
                    } else {
                        dropped.push(
                            `${chip.label} (no recent conversation at index ${chip.recentConversationIndex})`,
                        );
                    }
                }
            }

            const validated = resolved.filter((chip) => {
                const result = validateGeneratedSuggestion(
                    chip,
                    validationCatalog,
                    availableExplores,
                    enabledTools,
                );
                if (!result.valid) {
                    dropped.push(`${chip.label} (${result.reason})`);
                    return false;
                }
                return true;
            });
            if (dropped.length > 0) {
                Logger.warn(
                    `[AiAgentService] Dropped ${dropped.length} suggestion chip(s): ${dropped.join('; ')}`,
                );
            }
            if (validated.length === 0) {
                chips = SUGGESTION_FALLBACK_CHIPS;
                usingFallback = true;
            } else {
                chips = validated;
                usingFallback = false;
            }
            modelId = String(modelOptions.model.modelId ?? 'unknown');
        } catch (error) {
            Logger.warn(
                `[AiAgentService] Failed to generate agent suggestions, falling back to defaults: ${String(
                    error,
                )}`,
            );
            Sentry.captureException(error, {
                tags: { errorType: 'AiAgentSuggestionsGenerationFailed' },
            });
        }

        this.analytics.track<AiAgentSuggestionsGeneratedEvent>({
            event: 'ai_agent.suggestions_generated',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                agentId: agentUuid,
                chipCount: chips.length,
                exploreCount: explores.length,
                verifiedQuestionsCount: verifiedQuestions.length,
                latencyMs: Date.now() - startedAt,
                modelId,
                usingFallback,
            },
        });

        return { chips };
    }

    private async buildSuggestionsThreadContext({
        organizationUuid,
        threadUuid,
        afterMessageUuid,
        availableExplores,
    }: {
        organizationUuid: string;
        threadUuid: string;
        afterMessageUuid?: string;
        availableExplores: Explore[];
    }): Promise<NonNullable<SuggestionPromptContext['thread']> | null> {
        const messages = await this.aiAgentModel.findThreadMessages({
            organizationUuid,
            threadUuid,
        });
        if (messages.length === 0) return null;

        // Pick the target assistant message: the one named by afterMessageUuid
        // if supplied, else the most recent assistant message in the thread.
        const candidates = messages.filter(
            (m): m is Extract<typeof m, { role: 'assistant' }> =>
                m.role === 'assistant',
        );
        const latestAssistant = afterMessageUuid
            ? (candidates.find((m) => m.uuid === afterMessageUuid) ??
              candidates[candidates.length - 1])
            : candidates[candidates.length - 1];

        if (!latestAssistant) return null;

        const latestAssistantText = (latestAssistant.message ?? '').slice(
            0,
            1600,
        );
        const askedClarifyingQuestion =
            detectClarifyingQuestion(latestAssistantText);
        const refused = detectRefusal(latestAssistantText);

        const latestQueryExplore = extractLatestQueryExplore(
            latestAssistant.toolCalls ?? [],
            availableExplores,
        );

        const recentMessages = messages.slice(-6).map((m) => ({
            role: m.role,
            text: (m.message ?? '').slice(0, 600),
        }));

        return {
            recentMessages,
            latestAssistantTurn: {
                text: latestAssistantText,
                askedClarifyingQuestion,
                refused,
                latestQueryExplore,
            },
        };
    }

    private async fetchSuggestionsRecentConversations({
        organizationUuid,
        agentUuid,
        userUuid,
    }: {
        organizationUuid: string;
        agentUuid: string;
        userUuid: string;
    }): Promise<SuggestionPromptContext['recentUserConversations']> {
        try {
            const threads = await this.aiAgentModel.findThreads({
                organizationUuid,
                agentUuid,
                userUuid,
                createdFrom: ['web_app', 'slack'],
            });
            const sorted = [...threads].sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
            );
            const now = Date.now();
            return sorted.slice(0, 5).map((thread) => {
                const createdAt = new Date(thread.createdAt).getTime();
                const daysAgo = Math.max(
                    0,
                    Math.floor((now - createdAt) / (1000 * 60 * 60 * 24)),
                );
                const topic =
                    thread.title ??
                    thread.firstMessage?.message ??
                    'Untitled thread';
                return {
                    topic: topic.slice(0, 200),
                    lastUserMessage:
                        thread.firstMessage?.message?.slice(0, 200) ?? null,
                    daysAgo,
                    threadUuid: thread.uuid,
                };
            });
        } catch (error) {
            Logger.warn(
                `[AiAgentService] Failed to fetch recent conversations for suggestions: ${String(
                    error,
                )}`,
            );
            return [];
        }
    }

    private async fetchSuggestionsVerifiedContent(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SuggestionPromptContext['verifiedContent']> {
        try {
            const items =
                await this.projectService.getVerifiedContentForHomepage(
                    user,
                    projectUuid,
                );
            return items.slice(0, 10).map((item) => {
                const isDashboard = 'spaceUuid' in item && 'tiles' in item;
                return {
                    title: item.name,
                    type: isDashboard ? 'dashboard' : 'chart',
                    description: item.description ?? null,
                };
            });
        } catch (error) {
            Logger.warn(
                `[AiAgentService] Failed to fetch verified content for suggestions: ${String(
                    error,
                )}`,
            );
            return [];
        }
    }

    private async executeAsyncAiMetricQuery(
        user: SessionUser,
        projectUuid: string,
        metricQuery: AiMetricQueryWithFilters,
        vizConfig: AiAgentVizConfig['config'],
    ) {
        const explore = await this.getExplore(
            user,
            projectUuid,
            null,
            metricQuery.exploreName,
        );

        const metricQueryFields = [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
        ];

        validateSelectedFieldsExistence(
            explore,
            metricQueryFields,
            metricQuery.additionalMetrics,
        );

        const populatedCustomMetrics = populateCustomMetricsSQL(
            metricQuery.customMetrics,
            explore,
        );
        const metricQueryWithCustomMetrics = {
            ...metricQuery,
            metrics: expandMetricsWithPopAdditionalMetrics(
                metricQuery.metrics,
                populatedCustomMetrics,
            ),
            additionalMetrics: populatedCustomMetrics,
        };
        const fields = getItemMap(explore);
        const webAiChartConfig = getWebAiChartConfig({
            vizConfig,
            metricQuery: metricQueryWithCustomMetrics,
            maxQueryLimit: this.lightdashConfig.ai.copilot.maxQueryLimit,
            fieldsMap: fields,
        });
        const groupByDimensions = getGroupByDimensions(webAiChartConfig);
        const pivotConfiguration = groupByDimensions?.length
            ? derivePivotConfigurationFromChart(
                  {
                      chartConfig: webAiChartConfig.echartsConfig,
                      pivotConfig: { columns: groupByDimensions },
                  },
                  metricQueryWithCustomMetrics,
                  fields,
              )
            : undefined;

        const asyncQuery = await this.asyncQueryService.executeAsyncMetricQuery(
            {
                account: fromSession(user),
                projectUuid,
                metricQuery: metricQueryWithCustomMetrics,
                context: QueryExecutionContext.AI,
                pivotConfiguration,
            },
        );

        return asyncQuery;
    }

    public async getAgent(
        user: SessionUser,
        agentUuid: string,
        projectUuid?: string,
        options?: { includeSummaryContext: true },
    ): Promise<AiAgentWithContext>;

    public async getAgent(
        user: SessionUser,
        agentUuid: string,
        projectUuid?: string,
        options?: { includeSummaryContext?: false },
    ): Promise<AiAgent>;

    public async getAgent(
        user: SessionUser,
        agentUuid: string,
        projectUuid?: string,
        options?: { includeSummaryContext?: boolean },
    ): Promise<AiAgent | AiAgentWithContext> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
            projectUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        // Check group access
        const hasAccess = await this.checkAgentAccess(user, agent);
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to access this agent',
            );
        }

        if (options?.includeSummaryContext) {
            const context = await this.getAgentSummaryContext(user, agent);
            return { ...agent, context };
        }

        return agent;
    }

    public async listAgents(user: SessionUser, projectUuid?: string) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agents = await this.aiAgentModel.findAllAgents({
            organizationUuid,
            filter: projectUuid
                ? { projectFilter: { projectUuid } }
                : undefined,
        });

        const agentsWithAccess = (
            await Promise.all(
                agents.map(async (agent) => {
                    const hasAccess = await this.checkAgentAccess(user, agent);
                    return hasAccess ? agent : null;
                }),
            )
        ).filter((agent): agent is NonNullable<typeof agent> => agent !== null);

        return agentsWithAccess;
    }

    public async getModelOptions(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
    ): Promise<AiModelOption[]> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
            projectUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const hasAccess = await this.checkAgentAccess(user, agent);
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to access this agent',
            );
        }

        const defaultModel = getDefaultModel(this.lightdashConfig.ai.copilot);

        return getAvailableModels(this.lightdashConfig.ai.copilot).map(
            (preset) => {
                const isDefault =
                    preset.provider === defaultModel.provider &&
                    matchesPreset(preset, defaultModel.name);

                return {
                    name: preset.name,
                    displayName: preset.displayName,
                    description: preset.description,
                    provider: preset.provider,
                    default: isDefault,
                    supportsReasoning: preset.supportsReasoning,
                };
            },
        );
    }

    async listAgentThreads(
        user: SessionUser,
        agentUuid: string,
        allUsers?: boolean,
    ): Promise<AiAgentThreadSummary[]> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError();
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const hasAccess = await this.checkAgentAccess(user, agent);

        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to access this agent',
            );
        }

        // Check if user has admin permissions to view all threads
        const auditedAbility = this.createAuditedAbility(user);
        const canViewAllThreads =
            allUsers &&
            auditedAbility.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
                    metadata: {
                        agentUuid,
                        agentName: agent.name,
                    },
                }),
            );

        if (allUsers && !canViewAllThreads) {
            throw new ForbiddenError(
                'Insufficient permissions to view all agent threads',
            );
        }

        const threads = await this.aiAgentModel.findThreads({
            organizationUuid,
            agentUuid,
            // Only filter by userUuid if not requesting all users or if user lacks admin permissions
            userUuid: canViewAllThreads ? undefined : user.userUuid,
            createdFrom: ['web_app', 'slack'],
        });

        const slackUserIds = _.uniq(
            threads
                .filter((thread) => thread.createdFrom === 'slack')
                .filter((thread) => thread.user.slackUserId !== null)
                .map((thread) => thread.user.slackUserId),
        );

        const slackUsers = await Promise.all(
            slackUserIds.map((userId) =>
                this.slackClient.getUserInfo(organizationUuid, userId!),
            ),
        );

        return threads.map((thread) => {
            if (thread.createdFrom !== 'slack') {
                return thread;
            }

            const slackUser = slackUsers.find(
                ({ id }) =>
                    thread.user.slackUserId !== null &&
                    id === thread.user.slackUserId,
            );

            return {
                ...thread,
                user: {
                    name: slackUser?.name ?? thread.user.name,
                    uuid: thread.user.uuid,
                },
            };
        });
    }

    async listProjectThreads(
        user: SessionUser,
        projectUuid: string,
        {
            filters,
            paginateArgs,
        }: {
            filters?: AiAgentThreadFilters;
            paginateArgs?: KnexPaginateArgs;
        },
    ): Promise<
        KnexPaginatedData<
            AiAgentProjectThreadSummary<
                AiAgentUser & { slackUserId: string | null }
            >[]
        >
    > {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError();
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const accessibleAgents = await this.listAgents(user, projectUuid);
        const accessibleAgentUuids = accessibleAgents.map(
            (agent) => agent.uuid,
        );

        if (
            filters?.agentUuid &&
            !accessibleAgentUuids.includes(filters.agentUuid)
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to access this agent',
            );
        }

        if (accessibleAgentUuids.length === 0) {
            return {
                data: [],
                pagination: paginateArgs
                    ? { ...paginateArgs, totalPageCount: 0, totalResults: 0 }
                    : undefined,
            };
        }

        const { data: threads, pagination } =
            await this.aiAgentModel.findThreadsPaginated({
                organizationUuid,
                projectUuid,
                userUuid: user.userUuid,
                agentUuids: filters?.agentUuid
                    ? [filters.agentUuid]
                    : accessibleAgentUuids,
                createdFrom: filters?.createdFrom
                    ? [filters.createdFrom]
                    : ['web_app', 'slack'],
                search: filters?.search,
                paginateArgs,
            });

        const slackUserIds = _.uniq(
            threads
                .filter((thread) => thread.createdFrom === 'slack')
                .filter((thread) => thread.user.slackUserId !== null)
                .map((thread) => thread.user.slackUserId),
        );

        // Resolve Slack users individually and tolerate failures: a single
        // deleted/unknown Slack user (`user_not_found`) must not fail the whole
        // thread list. Failed lookups fall back to the stored thread user name.
        const slackUsers = (
            await Promise.all(
                slackUserIds.map(async (userId) => {
                    try {
                        return await this.slackClient.getUserInfo(
                            organizationUuid,
                            userId!,
                        );
                    } catch (error) {
                        this.logger.warn(
                            `Failed to fetch Slack user info for ${userId}`,
                            { organizationUuid, error },
                        );
                        return null;
                    }
                }),
            )
        ).filter((slackUser) => slackUser !== null);

        const data = threads.map((thread) => {
            if (thread.createdFrom !== 'slack') {
                return thread;
            }

            const slackUser = slackUsers.find(
                (su) =>
                    thread.user.slackUserId !== null &&
                    su.id === thread.user.slackUserId,
            );

            return {
                ...thread,
                user: {
                    ...thread.user,
                    name: slackUser?.name ?? thread.user.name,
                },
            };
        });

        return { data, pagination };
    }

    async getAgentThread(
        user: SessionUser,
        agentUuid: string,
        threadUuid: string,
    ): Promise<AiAgentThread> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });

        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }

        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to view this thread',
            );
        }

        const messages = await this.aiAgentModel.findThreadMessages({
            organizationUuid,
            threadUuid,
        });
        const compactions = await this.aiAgentModel.findThreadCompactions({
            organizationUuid,
            threadUuid,
        });

        if (thread.createdFrom !== 'slack') {
            return {
                ...thread,
                messages,
                compactions,
            };
        }

        const slackUserIds = _.uniq(
            messages
                .filter((message) => message.role === 'user')
                .filter((message) => message.user.slackUserId !== null)
                .map((message) => message.user.slackUserId),
        );

        const slackUsers = await Promise.all(
            slackUserIds.map((userId) =>
                this.slackClient.getUserInfo(organizationUuid, userId!),
            ),
        );

        return {
            ...thread,
            compactions,
            messages: messages.map((message) => {
                if (message.role !== 'user') {
                    return message;
                }

                const slackUser = slackUsers.find(
                    ({ id }) =>
                        message.user.slackUserId != null &&
                        id === message.user.slackUserId,
                );

                return {
                    ...message,
                    user: {
                        name: slackUser?.name ?? message.user.name,
                        uuid: message.user.uuid,
                    },
                };
            }),
        };
    }

    async decideSqlApproval(
        user: SessionUser,
        {
            agentUuid,
            threadUuid,
            toolCallId,
            decision,
        }: {
            agentUuid: string;
            threadUuid: string;
            toolCallId: string;
            decision: 'approved' | 'rejected';
        },
    ): Promise<{ decision: 'approved' | 'rejected' }> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        if (!(await this.getIsCopilotEnabled(user))) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const context =
            await this.aiAgentModel.findSqlApprovalContext(toolCallId);
        if (!context) {
            throw new NotFoundError(`Tool call not found: ${toolCallId}`);
        }
        if (context.threadUuid !== threadUuid) {
            throw new ForbiddenError(
                'Tool call does not belong to the supplied thread',
            );
        }
        if (context.agentUuid !== agentUuid) {
            throw new ForbiddenError(
                'Tool call does not belong to the supplied agent',
            );
        }
        if (context.toolName !== 'runSql') {
            throw new ParameterError(
                `Tool call ${toolCallId} is not a runSql approval`,
            );
        }
        if (context.hasResult) {
            throw new AlreadyExistsError(
                `Tool call ${toolCallId} has already been resolved`,
            );
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });
        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });
        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }

        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to approve this SQL execution',
            );
        }

        // The SQL ultimately runs under the prompt issuer's identity, but
        // approving raw SQL is itself a privileged action — require the
        // approver to hold the same SqlRunner scope so a thread reader
        // without that ability can't trigger execution.
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('SqlRunner', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
                    metadata: {
                        agentUuid,
                        threadUuid,
                        toolCallId,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You need the SqlRunner permission to approve SQL execution',
            );
        }

        const recorded = await this.aiAgentModel.recordSqlApproval(
            toolCallId,
            decision,
            user.userUuid,
        );
        if (!recorded) {
            // A decision was already in place for this tool call — likely a
            // double-click or a race between Slack and the web UI. First
            // write wins; subsequent calls are a no-op.
            this.logger.info(
                `SQL approval for ${toolCallId} was already recorded; ignoring duplicate.`,
            );
        }

        return { decision };
    }

    async createAgentThread(
        user: SessionUser,
        agentUuid: string,
        body: ApiAiAgentThreadCreateRequest,
        createdFrom: 'web_app' | 'evals' = 'web_app',
    ) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const hasAccess = await this.checkAgentAccess(user, agent);
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to create threads for this agent',
            );
        }

        const context = body.prompt
            ? await this.validatePromptContextAccess(user, agent, body.context)
            : undefined;

        const threadUuid = await this.aiAgentModel.createWebAppThread({
            organizationUuid,
            projectUuid: agent.projectUuid,
            userUuid: user.userUuid,
            createdFrom,
            agentUuid,
        });

        if (body.prompt) {
            await this.aiAgentModel.createWebAppPrompt({
                threadUuid,
                createdByUserUuid: user.userUuid,
                prompt: body.prompt,
                context,
                modelConfig: body.modelConfig,
            });

            this.analytics.track<AiAgentPromptCreatedEvent>({
                event: 'ai_agent_prompt.created',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: agent.projectUuid,
                    aiAgentId: agentUuid,
                    threadId: threadUuid,
                    context: 'web_app',
                    ...AiAgentService.getPinnedContextAnalyticsProperties(
                        context,
                    ),
                },
            });
        }

        return this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });
    }

    async createAgentThreadMessage(
        user: SessionUser,
        agentUuid: string,
        threadUuid: string,
        body: ApiAiAgentThreadMessageCreateRequest,
    ): Promise<ApiAiAgentThreadMessageCreateResponse['results']> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });

        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }

        // Check if user has access to create messages for this agent's thread
        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to create messages for this thread',
            );
        }

        const context = await this.validatePromptContextAccess(
            user,
            agent,
            body.context,
        );

        const messageUuid = await this.aiAgentModel.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: user.userUuid,
            prompt: body.prompt,
            context,
            modelConfig: body.modelConfig,
        });

        this.analytics.track<AiAgentPromptCreatedEvent>({
            event: 'ai_agent_prompt.created',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: agent.projectUuid,
                aiAgentId: agentUuid,
                threadId: threadUuid,
                context: 'web_app',
                ...AiAgentService.getPinnedContextAnalyticsProperties(context),
            },
        });

        return this.aiAgentModel.findThreadMessage('user', {
            organizationUuid,
            threadUuid,
            messageUuid,
        });
    }

    public async createAgent(user: SessionUser, body: ApiCreateAiAgent) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: body.projectUuid,
                    metadata: {
                        agentName: body.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const agent = await this.aiAgentModel.createAgent({
            name: body.name,
            description: body.description,
            projectUuid: body.projectUuid,
            organizationUuid,
            tags: body.tags,
            integrations: body.integrations,
            instruction: body.instruction,
            groupAccess: body.groupAccess,
            userAccess: body.userAccess,
            spaceAccess: body.spaceAccess,
            mcpServerUuids: body.mcpServerUuids,
            enableDataAccess: body.enableDataAccess,
            enableSelfImprovement: body.enableSelfImprovement,
            enableContentTools:
                body.enableDataAccess && (body.enableContentTools ?? false),
            version: body.version,
        });

        this.analytics.track<AiAgentCreatedEvent>({
            event: 'ai_agent.created',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: body.projectUuid,
                aiAgentId: agent.uuid,
                agentName: agent.name,
                tagsCount: agent.tags?.length ?? 0,
                integrationsCount: agent.integrations?.length ?? 0,
            },
        });

        return agent;
    }

    private async assertCanManageMcpServers(
        user: SessionUser,
        projectUuid: string,
        metadata?: Record<string, unknown>,
    ): Promise<string> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid,
                    metadata,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        return organizationUuid;
    }

    /**
     * Personal OAuth credentials are different from MCP server management:
     * any project member who can view the project may connect/disconnect
     * their own account, but shared credentials stay manager-only.
     */
    private async assertCanUsePersonalMcpCredentials(
        user: SessionUser,
        projectUuid: string,
    ): Promise<string> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                    metadata: {
                        projectUuid,
                        projectName: project.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        return organizationUuid;
    }

    private async getProjectMcpServerOrThrow(
        projectUuid: string,
        mcpServerUuid: string,
    ) {
        const server = await this.aiAgentModel.getMcpServer(mcpServerUuid);
        if (!server || server.projectUuid !== projectUuid) {
            throw new NotFoundError('MCP server not found');
        }

        return server;
    }

    private async assertCanManageAgent(
        user: SessionUser,
        agentUuid: string,
        projectUuid?: string,
    ): Promise<AiAgent> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const agent = await this.getAgent(user, agentUuid, projectUuid);
        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid: agent.organizationUuid,
                    projectUuid: agent.projectUuid,
                    metadata: {
                        agentUuid: agent.uuid,
                        agentName: agent.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        return agent;
    }

    private async discoverMcpServerTools(args: {
        projectUuid: string;
        mcpServerUuid: string;
        actorUserUuid?: string;
        credential?: AiMcpCredential;
        defaultEnabledForExistingAttachments?: boolean;
    }) {
        const server = await this.getProjectMcpServerOrThrow(
            args.projectUuid,
            args.mcpServerUuid,
        );
        const credential =
            args.credential ??
            (args.actorUserUuid
                ? await this.aiAgentModel.resolveCredential(
                      args.mcpServerUuid,
                      args.actorUserUuid,
                  )
                : await this.aiAgentModel.getCredential(
                      args.mcpServerUuid,
                      'shared',
                  ));

        const tools = await this.aiAgentMcpRuntimeClient.listTools({
            projectUuid: args.projectUuid,
            userUuid: args.actorUserUuid,
            mcpServer: {
                ...server,
                resolvedCredential: credential?.credentials ?? null,
                resolvedCredentialScope: credential?.credentialScope ?? null,
            },
        });

        return this.aiAgentModel.upsertDiscoveredMcpServerTools({
            serverUuid: args.mcpServerUuid,
            tools,
            defaultPermissionModeForExistingAttachments:
                args.defaultEnabledForExistingAttachments
                    ? AI_AGENT_MCP_SERVER_TOOL_PERMISSION_MODE_ALWAYS_ALLOW
                    : undefined,
        });
    }

    public async listMcpServers(user: SessionUser, projectUuid: string) {
        await this.assertCanManageMcpServers(user, projectUuid);
        return this.aiAgentModel.listMcpServers(projectUuid, user.userUuid);
    }

    public async listMcpServerTools(
        user: SessionUser,
        projectUuid: string,
        mcpServerUuid: string,
    ) {
        await this.assertCanManageMcpServers(user, projectUuid);

        return this.aiAgentModel.listMcpServerTools({
            projectUuid,
            serverUuid: mcpServerUuid,
        });
    }

    public async refreshMcpServerTools(
        user: SessionUser,
        projectUuid: string,
        mcpServerUuid: string,
    ) {
        await this.assertCanManageMcpServers(user, projectUuid);

        try {
            return await this.discoverMcpServerTools({
                projectUuid,
                mcpServerUuid,
                actorUserUuid: user.userUuid,
            });
        } catch (error) {
            throw new ParameterError(
                `We couldn't refresh this MCP server's tools. Check the connection and authentication settings, then try again. Details: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    public async listAgentMcpServers(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
    ) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        await this.getAgent(user, agentUuid, projectUuid);

        return this.aiAgentModel
            .getAgentMcpServersWithSensitiveData(agentUuid, user.userUuid)
            .then((servers) =>
                servers.map(
                    ({
                        resolvedCredential: _resolvedCredential,
                        resolvedCredentialScope: _resolvedCredentialScope,
                        ...server
                    }) => server,
                ),
            );
    }

    private static toApiAgentMcpServerTool(
        tool: AiAgentMcpServerToolPermissionSetting,
    ) {
        const { permissionMode, ...apiTool } = tool;

        return {
            ...apiTool,
            enabled:
                permissionMode ===
                AI_AGENT_MCP_SERVER_TOOL_PERMISSION_MODE_ALWAYS_ALLOW,
        };
    }

    private static toAgentMcpServerToolPermissionMode(enabled: boolean) {
        return enabled
            ? AI_AGENT_MCP_SERVER_TOOL_PERMISSION_MODE_ALWAYS_ALLOW
            : AI_AGENT_MCP_SERVER_TOOL_PERMISSION_MODE_ALWAYS_DENY;
    }

    public async listAgentMcpServerTools(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        mcpServerUuid: string,
    ) {
        await this.assertCanManageAgent(user, agentUuid, projectUuid);
        await this.getProjectMcpServerOrThrow(projectUuid, mcpServerUuid);

        return this.aiAgentModel
            .listAgentMcpServerTools({
                agentUuid,
                serverUuid: mcpServerUuid,
            })
            .then((tools) => tools.map(AiAgentService.toApiAgentMcpServerTool));
    }

    public async updateAgentMcpServerTools(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        mcpServerUuid: string,
        body: ApiUpdateAiAgentMcpServerToolsRequest,
    ) {
        await this.assertCanManageAgent(user, agentUuid, projectUuid);
        await this.getProjectMcpServerOrThrow(projectUuid, mcpServerUuid);

        const toolSettings: AiAgentMcpServerToolPermissionSettingUpdate[] = [
            ...new Map<string, AiAgentMcpServerToolPermissionSettingUpdate>(
                body.toolSettings.map(
                    (
                        tool,
                    ): [
                        string,
                        AiAgentMcpServerToolPermissionSettingUpdate,
                    ] => [
                        tool.toolName,
                        {
                            toolName: tool.toolName,
                            permissionMode:
                                AiAgentService.toAgentMcpServerToolPermissionMode(
                                    tool.enabled,
                                ),
                        },
                    ],
                ),
            ).values(),
        ];

        return this.aiAgentModel
            .upsertAgentMcpServerToolSettings({
                agentUuid,
                serverUuid: mcpServerUuid,
                toolSettings,
            })
            .then((tools) => tools.map(AiAgentService.toApiAgentMcpServerTool));
    }

    public async createMcpServer(
        user: SessionUser,
        projectUuid: string,
        body: ApiCreateAiMcpServer,
    ) {
        await this.assertCanManageMcpServers(user, projectUuid, {
            mcpServerName: body.name,
        });

        const name = body.name.trim();
        if (!name) {
            throw new ParameterError('MCP server name is required');
        }

        const normalizedUrl = (
            await validatePublicHttpUrl(body.url, {
                allowedProtocols: ['http:', 'https:'],
                allowPrivateAddresses: process.env.NODE_ENV === 'test',
            })
        ).toString();

        // Only createMcpServer callers can set this flag, and this endpoint is
        // already gated by assertCanManageMcpServers above.
        const allowOAuthCredentialSharing =
            body.allowOAuthCredentialSharing ?? false;

        switch (body.authType) {
            case 'none':
                if (body.credentials?.bearerToken) {
                    throw new ParameterError(
                        'Credentials are not allowed for auth type "none"',
                    );
                }
                if (body.credentialScope !== undefined) {
                    throw new ParameterError(
                        'Credential scope is not allowed for auth type "none"',
                    );
                }
                if (allowOAuthCredentialSharing) {
                    throw new ParameterError(
                        'OAuth credential sharing is only allowed for auth type "oauth"',
                    );
                }
                break;
            case 'bearer':
                if (!body.credentials?.bearerToken.trim()) {
                    throw new ParameterError(
                        'Bearer MCP servers require a bearer token',
                    );
                }
                if (allowOAuthCredentialSharing) {
                    throw new ParameterError(
                        'OAuth credential sharing is only allowed for auth type "oauth"',
                    );
                }
                break;
            case 'oauth':
                if (body.credentials?.bearerToken) {
                    throw new ParameterError(
                        'Bearer credentials are not allowed for auth type "oauth"',
                    );
                }
                if (body.credentialScope !== undefined) {
                    throw new ParameterError(
                        'Credential scope is set during OAuth connection, not MCP server creation',
                    );
                }
                break;
            default:
                assertUnreachable(
                    body.authType,
                    `Unknown MCP auth type: ${body.authType}`,
                );
        }

        const credentials =
            body.authType === 'bearer'
                ? {
                      bearerToken: body.credentials!.bearerToken.trim(),
                  }
                : null;

        let mcpConnectionMetadata: { iconUrl: string | null } | null = null;

        try {
            if (body.authType !== 'oauth') {
                mcpConnectionMetadata =
                    await this.aiAgentMcpRuntimeClient.testConnection({
                        name,
                        url: normalizedUrl,
                        authType: body.authType,
                        bearerToken: credentials?.bearerToken,
                        onUncaughtError: (error) => {
                            Logger.error(
                                `[AiAgent][MCP][${name}] Uncaught MCP client error while validating connection`,
                                error,
                            );
                        },
                    });
            }
        } catch (error) {
            throw new ParameterError(
                `We couldn't connect to this MCP server. Check the URL and authentication settings, then try again. Details: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        const server = await this.aiAgentModel.createMcpServer({
            projectUuid,
            name,
            url: normalizedUrl,
            iconUrl: mcpConnectionMetadata?.iconUrl ?? null,
            authType: body.authType,
            allowOAuthCredentialSharing,
            credentials,
            credentialScope:
                body.authType === 'bearer' ? body.credentialScope : undefined,
            actorUserUuid: user.userUuid,
        });

        if (body.authType !== 'oauth') {
            await this.discoverMcpServerTools({
                projectUuid,
                mcpServerUuid: server.uuid,
                actorUserUuid: user.userUuid,
            }).catch((error) => {
                Logger.error(
                    `[AiAgent][MCP][${server.name}] Failed to discover tools after MCP server creation`,
                    error,
                );
            });
        }

        return server;
    }

    /**
     * Whether the one-click "Connect GitHub" affordance should be offered for
     * this project. It is available only when the org has a GitHub App
     * installation AND the caller has the same permission required to manage
     * that integration (manage:GitIntegration) — so a project-level agent
     * manager who is not an org admin does not see it.
     */
    public async getGithubMcpAvailability(
        user: SessionUser,
        projectUuid: string,
    ): Promise<AiMcpGithubAvailability> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            return { available: false, alreadyConnected: false };
        }

        const { enabled: oneClickEnabled } = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.GithubMcpOneClick,
        });
        if (!oneClickEnabled) {
            return { available: false, alreadyConnected: false };
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            return { available: false, alreadyConnected: false };
        }
        const auditedAbility = this.createAuditedAbility(user);
        const canManageMcpServers = auditedAbility.can(
            'manage',
            subject('AiAgent', { organizationUuid, projectUuid }),
        );

        const servers = await this.aiAgentModel.listMcpServers(
            projectUuid,
            user.userUuid,
        );
        const githubServer = servers.find(
            (server) => server.url === GITHUB_MCP_SERVER_URL,
        );

        const available = canManageMcpServers || !!githubServer;
        if (!available) {
            return { available: false, alreadyConnected: false };
        }

        const credential = githubServer
            ? await this.aiAgentModel.resolveCredential(
                  githubServer.uuid,
                  user.userUuid,
              )
            : undefined;

        return { available: true, alreadyConnected: !!credential };
    }

    public async connectGithubMcpServer(
        user: SessionUser,
        projectUuid: string,
        personalAccessToken: string,
        credentialScope: AiMcpCredentialScope,
    ) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const { enabled: oneClickEnabled } = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.GithubMcpOneClick,
        });
        if (!oneClickEnabled) {
            throw new ForbiddenError(
                'One-click GitHub MCP setup is not enabled',
            );
        }

        const bearerToken = personalAccessToken.trim();
        if (!bearerToken) {
            throw new ParameterError(
                'A GitHub personal access token is required',
            );
        }
        if (!/^(github_pat_|gh[pousr]_)[A-Za-z0-9_]+$/.test(bearerToken)) {
            throw new ParameterError(
                'That doesn\'t look like a GitHub personal access token. Expected a fine-grained token starting with "github_pat_".',
            );
        }

        const existing = await this.aiAgentModel.listMcpServers(
            projectUuid,
            user.userUuid,
        );
        const githubServer = existing.find(
            (server) => server.url === GITHUB_MCP_SERVER_URL,
        );

        if (githubServer) {
            if (credentialScope === 'shared') {
                await this.assertCanManageMcpServers(user, projectUuid);
            } else {
                await this.assertCanUsePersonalMcpCredentials(
                    user,
                    projectUuid,
                );
            }

            try {
                await this.aiAgentMcpRuntimeClient.testConnection({
                    name: GITHUB_MCP_SERVER_NAME,
                    url: GITHUB_MCP_SERVER_URL,
                    authType: 'bearer',
                    bearerToken,
                    onUncaughtError: (error) => {
                        Logger.error(
                            `[AiAgent][MCP][${GITHUB_MCP_SERVER_NAME}] Uncaught MCP client error while reconnecting`,
                            error,
                        );
                    },
                });
            } catch (error) {
                Logger.error(
                    `[AiAgent][MCP][${GITHUB_MCP_SERVER_NAME}] Failed to reconnect with provided token`,
                    error,
                );
                throw new ParameterError(
                    "We couldn't connect to GitHub with that token. Check the token and its repository access, then try again.",
                );
            }

            await this.aiAgentModel.upsertCredential({
                serverUuid: githubServer.uuid,
                scope: credentialScope,
                userUuid: credentialScope === 'user' ? user.userUuid : null,
                credentials: { type: 'bearer', bearerToken },
                actorUserUuid: user.userUuid,
            });
            await this.aiAgentModel.updateMcpServerRuntimeState({
                serverUuid: githubServer.uuid,
                connectionStatus: 'connected',
                error: null,
                actorUserUuid: user.userUuid,
            });

            this.analytics.track({
                event: 'ai_agent.github_mcp_connected',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    mcpServerId: githubServer.uuid,
                    method: 'one_click_reconnect',
                },
            });

            const refreshed = await this.aiAgentModel.listMcpServers(
                projectUuid,
                user.userUuid,
            );
            return (
                refreshed.find(
                    (server) => server.url === GITHUB_MCP_SERVER_URL,
                ) ?? githubServer
            );
        }

        const server = await this.createMcpServer(user, projectUuid, {
            name: GITHUB_MCP_SERVER_NAME,
            url: GITHUB_MCP_SERVER_URL,
            authType: 'bearer',
            credentialScope,
            credentials: { bearerToken },
        });

        this.analytics.track({
            event: 'ai_agent.github_mcp_connected',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                mcpServerId: server.uuid,
                method: 'one_click',
            },
        });

        return server;
    }

    /**
     * The GitHub MCP server is authed with a GitHub App installation token,
     * which expires after ~1h. Rather than rely on the (stale) stored token,
     * mint a fresh one per run — mirroring how writeback mints per run — so the
     * connection can never expire mid-session.
     */
    private async refreshGithubMcpCredentials(
        organizationUuid: string | undefined,
        servers: AiMcpServerWithSensitiveData[],
    ): Promise<AiMcpServerWithSensitiveData[]> {
        const hasGithubMcp = servers.some(
            (server) =>
                server.url === GITHUB_MCP_SERVER_URL &&
                server.authType === 'bearer',
        );
        if (!hasGithubMcp || !organizationUuid) {
            return servers;
        }

        const installationId =
            await this.githubAppInstallationsModel.findInstallationId(
                organizationUuid,
            );
        if (!installationId) {
            return servers;
        }

        const bearerToken = await getInstallationToken(installationId);

        return servers.map((server) =>
            server.url === GITHUB_MCP_SERVER_URL && server.authType === 'bearer'
                ? {
                      ...server,
                      resolvedCredential: { type: 'bearer', bearerToken },
                  }
                : server,
        );
    }

    public async startMcpOAuthConnection(
        user: SessionUser,
        projectUuid: string,
        mcpServerUuid: string,
        body?: ApiAiMcpOAuthCredentialRequest,
    ): Promise<string> {
        const server = await this.getProjectMcpServerOrThrow(
            projectUuid,
            mcpServerUuid,
        );

        if (server.authType !== 'oauth') {
            throw new ParameterError('MCP server is not configured for OAuth');
        }

        const credentialScope: AiMcpCredentialScope =
            body?.credentialScope ?? 'user';

        if (credentialScope === 'shared') {
            if (!server.allowOAuthCredentialSharing) {
                throw new ParameterError(
                    'This MCP server does not allow shared OAuth credentials',
                );
            }
            await this.assertCanManageMcpServers(user, projectUuid);
        } else {
            await this.assertCanUsePersonalMcpCredentials(user, projectUuid);
        }

        return this.aiAgentMcpRuntimeClient.startOAuthConnection({
            projectUuid,
            mcpServerUuid,
            credentialScope,
            userUuid: credentialScope === 'user' ? user.userUuid : undefined,
            actorUserUuid: user.userUuid,
            serverUrl: server.url,
        });
    }

    public async completeMcpOAuthConnection(args: {
        projectUuid: string;
        mcpServerUuid: string;
        code?: string;
        state?: string;
    }): Promise<void> {
        const server = await this.getProjectMcpServerOrThrow(
            args.projectUuid,
            args.mcpServerUuid,
        );

        if (server.authType !== 'oauth') {
            throw new ParameterError('MCP server is not configured for OAuth');
        }

        const credential = args.state
            ? await this.aiAgentModel.getOauthCredentialByState({
                  serverUuid: args.mcpServerUuid,
                  state: args.state,
              })
            : undefined;

        if (!args.code || !args.state) {
            const errorMessage = 'OAuth callback is missing code or state';
            await this.persistMcpOAuthConnectionError(
                args.mcpServerUuid,
                errorMessage,
                credential,
            );
            throw new ParameterError(errorMessage);
        }

        if (credential?.credentials.type !== 'oauth') {
            throw new ParameterError('Invalid OAuth state');
        }

        await this.aiAgentMcpRuntimeClient.completeOAuthConnection({
            projectUuid: args.projectUuid,
            mcpServerUuid: args.mcpServerUuid,
            serverUrl: server.url,
            code: args.code,
            credential,
        });

        await this.discoverMcpServerTools({
            projectUuid: args.projectUuid,
            mcpServerUuid: args.mcpServerUuid,
            actorUserUuid:
                credential.userUuid ??
                credential.updatedByUserUuid ??
                credential.createdByUserUuid ??
                undefined,
            credential,
            defaultEnabledForExistingAttachments: true,
        }).catch((error) => {
            Logger.error(
                `[AiAgent][MCP][${server.name}] Failed to discover tools after OAuth connection completed`,
                error,
            );
        });
    }

    private async persistMcpOAuthConnectionError(
        mcpServerUuid: string,
        errorMessage: string,
        credential?: AiMcpCredential,
    ): Promise<void> {
        const existingCredential =
            credential ??
            (await this.aiAgentModel.getCredential(mcpServerUuid, 'shared'));

        if (existingCredential?.credentials.type !== 'oauth') {
            return;
        }

        await this.aiAgentModel.upsertCredential({
            serverUuid: mcpServerUuid,
            scope: existingCredential.credentialScope,
            credentials: {
                ...existingCredential.credentials,
                connectionStatus: 'error',
                lastError: errorMessage,
            },
            userUuid: existingCredential.userUuid,
            actorUserUuid:
                existingCredential.updatedByUserUuid ??
                existingCredential.createdByUserUuid ??
                null,
        });
    }

    public async disconnectMcpOAuthConnection(
        user: SessionUser,
        projectUuid: string,
        mcpServerUuid: string,
        body?: ApiAiMcpOAuthCredentialRequest,
    ): Promise<void> {
        const server = await this.getProjectMcpServerOrThrow(
            projectUuid,
            mcpServerUuid,
        );

        if (server.authType === 'none') {
            throw new ParameterError(
                'This MCP server has no credentials to disconnect',
            );
        }

        const credentialScope: AiMcpCredentialScope =
            body?.credentialScope ?? 'user';

        if (credentialScope === 'shared') {
            if (
                server.authType === 'oauth' &&
                !server.allowOAuthCredentialSharing
            ) {
                throw new ParameterError(
                    'This MCP server does not allow shared OAuth credentials',
                );
            }
            await this.assertCanManageMcpServers(user, projectUuid);
        } else {
            await this.assertCanUsePersonalMcpCredentials(user, projectUuid);
        }

        if (server.authType === 'oauth') {
            await this.aiAgentMcpRuntimeClient.disconnectOAuthConnection({
                mcpServerUuid,
                credentialScope,
                userUuid:
                    credentialScope === 'user' ? user.userUuid : undefined,
                actorUserUuid: user.userUuid,
            });
            return;
        }

        await this.aiAgentModel.deleteCredential({
            serverUuid: mcpServerUuid,
            scope: credentialScope,
            userUuid: credentialScope === 'user' ? user.userUuid : undefined,
        });
    }

    public async updateAgent(
        user: SessionUser,
        agentUuid: string,
        body: ApiUpdateAiAgent,
    ) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        const agent = await this.getAgent(user, agentUuid);
        if (agent.organizationUuid !== organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
                    metadata: {
                        agentUuid,
                        agentName: agent.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const nextEnableDataAccess =
            body.enableDataAccess ?? agent.enableDataAccess;

        const updatedAgent = await this.aiAgentModel.updateAgent({
            agentUuid,
            name: body.name,
            description: body.description,
            projectUuid: body.projectUuid,
            organizationUuid,
            tags: body.tags,
            integrations: body.integrations,
            instruction: body.instruction,
            imageUrl: body.imageUrl,
            groupAccess: body.groupAccess,
            userAccess: body.userAccess,
            spaceAccess: body.spaceAccess,
            mcpServerUuids: body.mcpServerUuids,
            enableDataAccess: body.enableDataAccess,
            enableSelfImprovement: body.enableSelfImprovement,
            enableContentTools: nextEnableDataAccess
                ? body.enableContentTools
                : false,
            version: body.version,
        });

        this.analytics.track<AiAgentUpdatedEvent>({
            event: 'ai_agent.updated',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: body.projectUuid,
                aiAgentId: agentUuid,
                agentName: body.name,
                tagsCount: updatedAgent.tags?.length ?? 0,
                integrationsCount: updatedAgent.integrations?.length ?? 0,
            },
        });

        return updatedAgent;
    }

    public async deleteAgent(user: SessionUser, agentUuid: string) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.getAgent(user, agentUuid);
        if (!agent) {
            throw new ForbiddenError('Agent not found');
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
                    metadata: {
                        agentUuid,
                        agentName: agent.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (agent.organizationUuid !== organizationUuid) {
            throw new ForbiddenError('Agent not found');
        }

        this.analytics.track<AiAgentDeletedEvent>({
            event: 'ai_agent.deleted',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: agent.projectUuid,
                aiAgentId: agentUuid,
                agentName: agent.name,
            },
        });

        return this.aiAgentModel.deleteAgent({
            organizationUuid,
            agentUuid,
        });
    }

    private async maybeCompactThreadBeforeResponse(
        user: SessionUser,
        {
            threadUuid,
            prompt,
        }: {
            threadUuid: string;
            prompt: AiWebAppPrompt;
        },
    ): Promise<ThreadCompaction | null> {
        // Web-app only for now. Slack still needs compaction UX + thread replay
        // semantics before we can safely reuse this flow there.
        const compactionLogContext = `[AiAgent][Compaction] thread=${threadUuid} prompt=${prompt.promptUuid}`;
        const latestCompaction =
            await this.aiAgentModel.findLatestThreadCompaction(threadUuid);

        if (prompt.threadUuid !== threadUuid) {
            Logger.debug(
                `${compactionLogContext} skipped reason=thread-mismatch promptThread=${prompt.threadUuid}`,
            );
            return latestCompaction ?? null;
        }

        const existingCompaction =
            await this.aiAgentModel.findThreadCompactionByTriggeringPrompt(
                prompt.promptUuid,
            );

        if (existingCompaction) {
            Logger.debug(
                `${compactionLogContext} skipped reason=already-compacted compaction=${existingCompaction.ai_thread_compaction_uuid}`,
            );
            return existingCompaction;
        }

        const { supportsCompaction, contextWindowTokens } =
            getCompactionModelMetadata(this.lightdashConfig.ai.copilot, {
                provider: prompt.modelConfig?.modelProvider as AnyType,
                modelName: prompt.modelConfig?.modelName,
            });

        if (!supportsCompaction || contextWindowTokens === null) {
            Logger.debug(
                `${compactionLogContext} skipped reason=unsupported-model provider=${prompt.modelConfig?.modelProvider ?? 'default'} model=${prompt.modelConfig?.modelName ?? 'default'}`,
            );
            return latestCompaction ?? null;
        }

        const previousPrompt =
            await this.aiAgentModel.findPreviousPromptInThread(
                threadUuid,
                prompt.promptUuid,
            );

        if (!previousPrompt) {
            Logger.debug(
                `${compactionLogContext} skipped reason=no-previous-prompt`,
            );
            return latestCompaction ?? null;
        }

        const previousPromptTotalTokens =
            previousPrompt.token_usage?.totalTokens;
        const threshold = contextWindowTokens - Compaction.RESERVE_TOKENS;
        const shouldCompact = Compaction.shouldCompactPrompt({
            totalTokens: previousPromptTotalTokens,
            contextWindowTokens,
            reserveTokens: Compaction.RESERVE_TOKENS,
        });

        Logger.debug(
            `${compactionLogContext} check previousPrompt=${previousPrompt.ai_prompt_uuid} totalTokens=${previousPromptTotalTokens ?? 'unknown'} contextWindow=${contextWindowTokens} reserveTokens=${Compaction.RESERVE_TOKENS} threshold=${threshold} shouldCompact=${shouldCompact}`,
        );

        if (!shouldCompact) {
            Logger.debug(
                `${compactionLogContext} skipped reason=under-threshold`,
            );
            return latestCompaction ?? null;
        }

        if (!user.organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const threadMessages = await this.aiAgentModel.findThreadMessages({
            organizationUuid: user.organizationUuid,
            threadUuid,
        });

        const messagesToCompact = Compaction.getMessagesToCompact(
            threadMessages,
            {
                compactedThroughPromptUuid:
                    latestCompaction?.compacted_through_ai_prompt_uuid ?? null,
                compactThroughPromptUuid: previousPrompt.ai_prompt_uuid,
            },
        );

        Logger.debug(
            `${compactionLogContext} selection selectedMessages=${messagesToCompact.length} totalThreadMessages=${threadMessages.length} compactedThroughPrompt=${latestCompaction?.compacted_through_ai_prompt_uuid ?? 'none'} compactThroughPrompt=${previousPrompt.ai_prompt_uuid}`,
        );

        if (messagesToCompact.length === 0) {
            Logger.debug(
                `${compactionLogContext} skipped reason=empty-selection`,
            );
            return latestCompaction ?? null;
        }

        const compactionModel = getModel(this.lightdashConfig.ai.copilot, {
            provider: prompt.modelConfig?.modelProvider as AnyType,
            modelName: prompt.modelConfig?.modelName,
            useFastModel: true,
        });

        const serializedInput =
            Compaction.serializeConversation(messagesToCompact);

        const summary = await generateCompactionSummary(compactionModel, {
            previousSummary: latestCompaction?.summary,
            conversation: serializedInput,
        });

        const createdCompaction =
            await this.aiAgentModel.createThreadCompaction({
                threadUuid,
                compactedThroughPromptUuid: previousPrompt.ai_prompt_uuid,
                triggeringPromptUuid: prompt.promptUuid,
                serializedInput,
                summary,
            });

        Logger.debug(
            `${compactionLogContext} created compaction=${createdCompaction.ai_thread_compaction_uuid} selectedMessages=${messagesToCompact.length} totalThreadMessages=${threadMessages.length} serializedInputChars=${serializedInput.length} summaryChars=${summary.length}`,
        );

        return createdCompaction;
    }

    private async prepareAgentThreadResponse(
        user: SessionUser,
        {
            agentUuid,
            threadUuid,
            retrieveRelevantArtifacts = true,
        }: {
            agentUuid: string;
            threadUuid: string;
            retrieveRelevantArtifacts?: boolean;
        },
    ) {
        if (!user.organizationUuid) {
            throw new ForbiddenError();
        }

        const thread = await this.aiAgentModel.getThread({
            organizationUuid: user.organizationUuid,
            agentUuid,
            threadUuid,
        });

        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid: user.organizationUuid,
            agentUuid: thread.agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found`);
        }

        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to access this agent thread',
            );
        }

        const threadMessages = await this.aiAgentModel.getThreadMessages(
            user.organizationUuid,
            agent.projectUuid,
            threadUuid,
        );

        if (threadMessages.length === 0) {
            throw new Error(
                `No messages found in thread: ${threadUuid}. ${agentUuid}`,
            );
        }

        const prompt = await this.aiAgentModel.findWebAppPrompt(
            threadMessages.at(-1)!.ai_prompt_uuid,
        );

        if (!prompt) {
            throw new NotFoundError(
                `Prompt not found: ${
                    threadMessages[threadMessages.length - 1].ai_prompt_uuid
                }`,
            );
        }
        const compaction = await this.maybeCompactThreadBeforeResponse(user, {
            threadUuid: prompt.threadUuid,
            prompt,
        });

        const compactedThreadMessages =
            Compaction.filterThreadMessagesAfterCompaction(
                threadMessages,
                compaction?.compacted_through_ai_prompt_uuid ?? null,
            );

        const chatHistoryMessages = await this.getChatHistoryFromThreadMessages(
            compactedThreadMessages,
            {
                organizationUuid: prompt.organizationUuid,
                projectUuid: agent.projectUuid,
                agentUuid: agent.uuid,
                retrieveRelevantArtifacts:
                    retrieveRelevantArtifacts &&
                    this.getIsVerifiedArtifactsEnabled(),
                compaction,
            },
        );

        return { user, chatHistoryMessages, prompt, compaction };
    }

    async streamAgentThreadResponse(
        user: SessionUser,
        {
            agentUuid,
            threadUuid,
            enableSqlMode,
            toolHints,
        }: {
            agentUuid: string;
            threadUuid: string;
            enableSqlMode: boolean;
            toolHints: string[];
        },
    ): Promise<AgentResponseStream> {
        try {
            const {
                user: validatedUser,
                chatHistoryMessages,
                prompt,
            } = await this.prepareAgentThreadResponse(user, {
                agentUuid,
                threadUuid,
            });

            if (!validatedUser.organizationUuid) {
                throw new ForbiddenError();
            }
            const auditedAbility = this.createAuditedAbility(validatedUser);
            const canManageAgent = auditedAbility.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid: validatedUser.organizationUuid,
                    projectUuid: prompt.projectUuid,
                    metadata: {
                        agentUuid,
                        threadUuid,
                    },
                }),
            );

            if (toolHints.length > 0) {
                this.analytics.track<AiAgentSuggestionSubmitEvent>({
                    event: 'ai_agent.suggestion_submit',
                    userId: user.userUuid,
                    properties: {
                        organizationId: validatedUser.organizationUuid,
                        projectId: prompt.projectUuid,
                        agentId: agentUuid,
                        toolHints,
                    },
                });
            }

            return await this.generateOrStreamAgentResponse(
                validatedUser,
                chatHistoryMessages,
                {
                    prompt,
                    stream: true,
                    canManageAgent,
                    enableSqlMode,
                    toolHints,
                },
            );
        } catch (e) {
            Logger.error('Failed to generate agent thread response:', e);
            throw new ParameterError(getUserFacingErrorMessage(e));
        }
    }

    async generateAgentThreadResponse(
        user: SessionUser,
        {
            agentUuid,
            threadUuid,
            autoApproveSql = false,
        }: {
            agentUuid: string;
            threadUuid: string;
            autoApproveSql?: boolean;
        },
    ): Promise<string> {
        try {
            const {
                user: validatedUser,
                chatHistoryMessages,
                prompt,
            } = await this.prepareAgentThreadResponse(user, {
                agentUuid,
                threadUuid,
            });
            if (!user.organizationUuid) {
                throw new ForbiddenError();
            }
            const auditedAbility = this.createAuditedAbility(user);
            const canManageAgent = auditedAbility.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid: user.organizationUuid,
                    projectUuid: prompt.projectUuid,
                    metadata: {
                        agentUuid,
                        threadUuid,
                    },
                }),
            );

            const response = await this.generateOrStreamAgentResponse(
                validatedUser,
                chatHistoryMessages,
                {
                    prompt,
                    stream: false,
                    canManageAgent,
                    // Non-stream callers (eval, etc.) preserve flag-only gating.
                    enableSqlMode: true,
                    autoApproveSql,
                },
            );
            return response;
        } catch (e) {
            Logger.error('Failed to generate agent thread response:', e);
            throw new ParameterError(getUserFacingErrorMessage(e));
        }
    }

    async generateThreadTitle(
        user: SessionUser,
        {
            agentUuid,
            threadUuid,
        }: {
            agentUuid: string;
            threadUuid: string;
        },
    ): Promise<string> {
        try {
            // Reuse existing validation and data fetching logic
            const { chatHistoryMessages } =
                await this.prepareAgentThreadResponse(user, {
                    agentUuid,
                    threadUuid,
                    retrieveRelevantArtifacts: false,
                });

            // Use fast model for title generation (lightweight task)
            const modelOptions = getModel(this.lightdashConfig.ai.copilot, {
                enableReasoning: false,
                useFastModel: true,
            });

            // Generate title using the dedicated title generator
            const title = await generateTitleFromMessages(
                modelOptions,
                chatHistoryMessages,
            );

            // Save the title to the database
            await this.aiAgentModel.updateThreadTitle({
                threadUuid,
                title,
            });

            return title;
        } catch (e) {
            Logger.error('Failed to generate thread title:', e);
            throw new Error('Failed to generate thread title');
        }
    }

    async evaluateReadiness(
        user: SessionUser,
        { agentUuid, projectUuid }: { agentUuid: string; projectUuid: string },
    ): Promise<ReadinessScore> {
        if (!user.organizationUuid) {
            throw new ForbiddenError();
        }
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                    metadata: { agentUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const agent = await this.getAgent(user, agentUuid);

        const explores = await this.getAvailableExplores(
            user,
            agent.projectUuid,
            agent.tags,
        );

        const { model } = getModel(this.lightdashConfig.ai.copilot, {
            enableReasoning: false,
        });

        const readinessScore = await evaluateAgentReadiness(
            model,
            explores,
            agent.instruction,
        );

        return readinessScore;
    }

    async getArtifactVizQuery(
        user: SessionUser,
        {
            projectUuid,
            agentUuid,
            artifactUuid,
            versionUuid,
        }: {
            projectUuid: string;
            agentUuid: string;
            artifactUuid: string;
            versionUuid: string;
        },
    ): Promise<ApiAiAgentThreadMessageVizQuery> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });
        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        // Check if user has access to this agent
        await this.getAgent(user, agentUuid, agent.projectUuid);

        // Get the specific artifact version
        const artifact = await this.aiAgentModel.getArtifact(
            artifactUuid,
            versionUuid,
        );
        if (!artifact) {
            throw new NotFoundError(
                `Artifact version not found: ${artifactUuid}/${versionUuid}`,
            );
        }

        if (!artifact.chartConfig) {
            throw new ParameterError(
                'Chart config not found for this artifact',
            );
        }

        const parsedVizConfig = parseVizConfig(
            artifact.chartConfig,
            this.lightdashConfig.ai.copilot.maxQueryLimit,
        );
        if (!parsedVizConfig) {
            throw new ParameterError('Could not generate a visualization');
        }

        const query = await this.executeAsyncAiMetricQuery(
            user,
            projectUuid,
            parsedVizConfig.metricQuery,
            artifact.chartConfig,
        );

        const metadata = {
            title: artifact.title ?? parsedVizConfig.vizTool?.title ?? null,
            description:
                artifact.description ??
                parsedVizConfig.vizTool?.description ??
                null,
        } satisfies AiVizMetadata;

        this.analytics.track({
            event: 'ai_agent.artifact_viz_query',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                agentId: agent.uuid,
                agentName: agent.name,
                artifactId: artifactUuid,
                artifactVersionId: versionUuid,
                vizType: parsedVizConfig.type,
            },
        });

        return {
            type: parsedVizConfig.type,
            query,
            metadata,
        };
    }

    async getDashboardArtifactChartVizQuery(
        user: SessionUser,
        {
            projectUuid,
            agentUuid,
            artifactUuid,
            versionUuid,
            chartIndex,
        }: {
            projectUuid: string;
            agentUuid: string;
            artifactUuid: string;
            versionUuid: string;
            chartIndex: number;
        },
    ): Promise<ApiAiAgentThreadMessageVizQuery> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });
        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        // Check if user has access to this agent
        await this.getAgent(user, agentUuid, agent.projectUuid);

        // Get the specific artifact version
        const artifact = await this.aiAgentModel.getArtifact(
            artifactUuid,
            versionUuid,
        );
        if (!artifact) {
            throw new NotFoundError(
                `Artifact version not found: ${artifactUuid}/${versionUuid}`,
            );
        }

        if (
            artifact.artifactType !== 'dashboard' ||
            !artifact.dashboardConfig
        ) {
            throw new ParameterError(
                'Dashboard config not found for this artifact',
            );
        }

        // We use base schema here because later we call `parseVizConfig` that uses transformed schem which takes base schema output as input
        // Try to parse with v2 schema first, then fall back to v1
        const dashboardConfigV2Parsed = toolDashboardV2ArgsSchema.safeParse(
            artifact.dashboardConfig,
        );
        let dashboardConfig: ToolDashboardArgs | ToolDashboardV2Args;
        if (dashboardConfigV2Parsed.success) {
            dashboardConfig = dashboardConfigV2Parsed.data;
        } else {
            const dashboardConfigV1Parsed = toolDashboardArgsSchema.safeParse(
                artifact.dashboardConfig,
            );
            if (!dashboardConfigV1Parsed.success) {
                throw new ParameterError('Invalid dashboard config');
            }
            dashboardConfig = dashboardConfigV1Parsed.data;
        }
        const { visualizations } = dashboardConfig;

        if (
            !Array.isArray(visualizations) ||
            chartIndex < 0 ||
            chartIndex >= visualizations.length
        ) {
            throw new ParameterError(
                `Invalid chart index: ${chartIndex}. Dashboard has ${
                    visualizations?.length || 0
                } charts.`,
            );
        }

        const chartConfig = visualizations[chartIndex];
        const parsedVizConfig = parseVizConfig(
            chartConfig,
            this.lightdashConfig.ai.copilot.maxQueryLimit,
        );
        if (!parsedVizConfig) {
            throw new ParameterError(
                'Could not generate a visualization for this chart',
            );
        }

        const query = await this.executeAsyncAiMetricQuery(
            user,
            projectUuid,
            parsedVizConfig.metricQuery,
            chartConfig,
        );

        const metadata = {
            title: chartConfig.title ?? parsedVizConfig.vizTool?.title ?? null,
            description:
                chartConfig.description ??
                parsedVizConfig.vizTool?.description ??
                null,
        } satisfies AiVizMetadata;

        this.analytics.track({
            event: 'ai_agent.dashboard_chart_viz_query',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                agentId: agent.uuid,
                agentName: agent.name,
                artifactId: artifactUuid,
                artifactVersionId: versionUuid,
                chartIndex,
                vizType: parsedVizConfig.type,
            },
        });

        return {
            type: parsedVizConfig.type,
            query,
            metadata,
        };
    }

    async updateHumanScoreForMessage(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        threadUuid: string,
        messageUuid: string,
        humanScore: number,
        humanFeedback?: string | null,
    ) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.getAgent(user, agentUuid, projectUuid);
        const message = await this.aiAgentModel.findPromptContext(messageUuid);
        if (
            !message ||
            message.organizationUuid !== organizationUuid ||
            message.projectUuid !== agent.projectUuid ||
            message.agentUuid !== agent.uuid ||
            message.threadUuid !== threadUuid
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to update feedback for this message',
            );
        }

        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid: agent.uuid,
            threadUuid,
        });

        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to update feedback for this thread',
            );
        }

        const threadMessage = await this.aiAgentModel.findThreadMessage(
            'assistant',
            {
                organizationUuid,
                threadUuid,
                messageUuid,
            },
        );

        if (humanScore !== 0) {
            this.analytics.track<AiAgentPromptFeedbackEvent>({
                event: 'ai_agent_prompt.feedback',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid,
                    humanScore,
                    messageId: threadMessage.uuid,
                    context: 'web_app',
                },
            });
        }

        await this.aiAgentModel.updateHumanScore({
            promptUuid: threadMessage.uuid,
            humanScore,
            humanFeedback,
        });

        this.enqueueReviewClassifierEvent({
            eventType: 'feedback_changed',
            organizationUuid,
            projectUuid: message.projectUuid,
            agentUuid: message.agentUuid,
            threadUuid: message.threadUuid,
            promptUuid: threadMessage.uuid,
            userUuid: user.userUuid,
        });
    }

    async updateMessageSavedQuery(
        user: SessionUser,
        {
            agentUuid,
            messageUuid,
            threadUuid,
            savedQueryUuid,
        }: {
            agentUuid: string;
            threadUuid: string;
            messageUuid: string;
            savedQueryUuid: string | null;
        },
    ): Promise<void> {
        const { organizationUuid } = user;
        if (!organizationUuid)
            throw new ForbiddenError(`Organization not found`);

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled)
            throw new ForbiddenError(`Copilot is not enabled`);

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });

        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }

        const message = await this.aiAgentModel.findThreadMessage('assistant', {
            organizationUuid,
            threadUuid,
            messageUuid,
        });

        // Check if user has access to update this thread
        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to update this thread',
            );
        }

        await this.aiAgentModel.updateMessageSavedQuery({
            messageUuid,
            savedQueryUuid,
        });
    }

    async updateArtifactVersion(
        user: SessionUser,
        {
            agentUuid,
            artifactUuid,
            versionUuid,
            savedDashboardUuid,
        }: {
            agentUuid: string;
            artifactUuid: string;
            versionUuid: string;
            savedDashboardUuid: string | null;
        },
    ): Promise<void> {
        const { organizationUuid } = user;
        if (!organizationUuid)
            throw new ForbiddenError(`Organization not found`);

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled)
            throw new ForbiddenError(`Copilot is not enabled`);

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        // Verify the artifact exists and user has access
        const artifact = await this.aiAgentModel.getArtifact(
            artifactUuid,
            versionUuid,
        );
        if (!artifact) {
            throw new NotFoundError(
                `Artifact version not found: ${artifactUuid}/${versionUuid}`,
            );
        }

        // Check if the user has access to the thread that contains this artifact
        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid: artifact.threadUuid,
        });
        if (!thread) {
            throw new NotFoundError(`Thread not found: ${artifact.threadUuid}`);
        }

        // Check if user has access to update this thread
        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to update this artifact',
            );
        }

        await this.aiAgentModel.updateArtifactVersion(versionUuid, {
            savedDashboardUuid,
        });
    }

    async setArtifactVersionVerified(
        user: SessionUser,
        {
            agentUuid,
            artifactUuid,
            versionUuid,
            verified,
        }: {
            agentUuid: string;
            artifactUuid: string;
            versionUuid: string;
            verified: boolean;
        },
    ): Promise<void> {
        const { organizationUuid } = user;
        if (!organizationUuid)
            throw new ForbiddenError(`Organization not found`);

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled)
            throw new ForbiddenError(`Copilot is not enabled`);

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        if (verified && !this.getIsVerifiedArtifactsEnabled()) {
            throw new NotImplementedError('Answer verification is not enabled');
        }

        // Only users who can manage the agent can verify artifacts
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
                    metadata: {
                        agentUuid,
                        agentName: agent.name,
                        artifactUuid,
                        versionUuid,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                'Only users with manage permissions can verify artifacts',
            );
        }

        const artifact = await this.aiAgentModel.getArtifact(
            artifactUuid,
            versionUuid,
        );
        if (!artifact) {
            throw new NotFoundError(
                `Artifact version not found: ${artifactUuid}/${versionUuid}`,
            );
        }

        await this.aiAgentModel.setArtifactVersionVerified(
            versionUuid,
            verified,
            user.userUuid,
        );

        this.analytics.track<AiAgentArtifactVersionVerifiedEvent>({
            event: 'ai_agent.artifact_version_verified',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: agent.projectUuid,
                agentId: agentUuid,
                artifactId: artifactUuid,
                versionId: versionUuid,
                verified,
            },
        });

        if (!verified) {
            return;
        }

        const embedding =
            await this.aiAgentModel.getArtifactEmbedding(versionUuid);
        if (embedding === null) {
            void this.schedulerClient
                .embedArtifactVersion({
                    organizationUuid,
                    projectUuid: agent.projectUuid,
                    userUuid: user.userUuid,
                    artifactVersionUuid: versionUuid,
                    title: artifact.title,
                    description: artifact.description,
                })
                .catch((error) => {
                    Logger.error(
                        'Failed to enqueue embedding job:',
                        error instanceof Error ? error.message : error,
                    );
                    Sentry.captureException(error);
                });
        }

        // Generate question if not already generated
        const existingQuestion =
            await this.aiAgentModel.getArtifactQuestion(versionUuid);
        if (!existingQuestion) {
            void this.schedulerClient
                .generateArtifactQuestion({
                    organizationUuid,
                    projectUuid: agent.projectUuid,
                    userUuid: user.userUuid,
                    artifactVersionUuid: versionUuid,
                    title: artifact.title,
                    description: artifact.description,
                })
                .catch((error) => {
                    Logger.error(
                        'Failed to enqueue question generation job:',
                        error instanceof Error ? error.message : error,
                    );
                    Sentry.captureException(error);
                });
        }
    }

    async embedArtifactVersion(payload: {
        artifactVersionUuid: string;
        title: string | null;
        description: string | null;
    }): Promise<void> {
        try {
            const text = [payload.title, payload.description]
                .filter(Boolean)
                .join('\n');

            if (!text.trim()) {
                return;
            }

            const embeddingResult = await generateEmbedding(
                text,
                this.lightdashConfig,
                { artifactVersionUuid: payload.artifactVersionUuid },
            );

            if (!embeddingResult) {
                return;
            }

            const { embedding, provider, modelName } = embeddingResult;

            await this.aiAgentModel.updateArtifactEmbedding(
                payload.artifactVersionUuid,
                embedding,
                provider,
                modelName,
            );
        } catch (error) {
            Logger.error(
                `Failed to embed artifact version ${payload.artifactVersionUuid}`,
            );
            Sentry.captureException(error);
        }
    }

    async generateArtifactQuestion(payload: {
        artifactVersionUuid: string;
        title: string | null;
        description: string | null;
    }): Promise<void> {
        try {
            if (!payload.title && !payload.description) {
                return;
            }

            const modelOptions = getModel(this.lightdashConfig.ai.copilot, {
                enableReasoning: false,
            });

            const question = await generateArtifactQuestion(
                modelOptions,
                payload.title,
                payload.description,
                { artifactVersionUuid: payload.artifactVersionUuid },
            );

            await this.aiAgentModel.updateArtifactQuestion(
                payload.artifactVersionUuid,
                question,
            );
        } catch (error) {
            Logger.error(
                `Failed to generate question for artifact version ${payload.artifactVersionUuid}`,
            );
            // Skip Sentry for AI API timeouts - these are expected transient failures
            if (!APICallError.isInstance(error)) {
                Sentry.captureException(error);
            }
        }
    }

    async getVerifiedQuestions(
        user: SessionUser,
        agentUuid: string,
    ): Promise<Array<{ question: string; uuid: string }>> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        // Check view permissions
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
                    metadata: {
                        agentUuid,
                        agentName: agent.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError('Cannot view agent questions');
        }

        return this.aiAgentModel.getVerifiedQuestions(agentUuid);
    }

    /**
     * Private method to get a summary context for an agent.
     * Assumes all permission checks and validations have been performed by the caller.
     */
    private async getAgentSummaryContext(
        user: SessionUser,
        agent: AiAgentSummary,
    ): Promise<AgentSummaryContext> {
        const availableExplores = await this.getAvailableExplores(
            user,
            agent.projectUuid,
            agent.tags,
        );
        const exploreNames = availableExplores.map(
            (explore) => explore.label || explore.name,
        );

        const verifiedQuestionsData =
            await this.aiAgentModel.getVerifiedQuestions(agent.uuid);
        const verifiedQuestions = verifiedQuestionsData.map((q) => q.question);

        return {
            uuid: agent.uuid,
            projectUuid: agent.projectUuid,
            name: agent.name,
            description: agent.description,
            explores: exploreNames,
            verifiedQuestions,
            instruction: agent.instruction,
        };
    }

    async revertChange(
        user: SessionUser,
        {
            agentUuid,
            threadUuid,
            promptUuid,
            changeUuid,
        }: {
            agentUuid: string;
            threadUuid: string;
            promptUuid: string;
            changeUuid: string;
        },
    ): Promise<void> {
        const { organizationUuid } = user;
        if (!organizationUuid)
            throw new ForbiddenError(`Organization not found`);

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled)
            throw new ForbiddenError(`Copilot is not enabled`);

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });

        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }

        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to revert this change',
            );
        }

        const originalChangeset =
            await this.changesetModel.findActiveChangesetWithChangesByProjectUuid(
                agent.projectUuid,
            );

        if (!originalChangeset) {
            throw new NotFoundError(
                `No active changeset found for project: ${agent.projectUuid}`,
            );
        }

        const change = await this.changesetModel.getChange(
            changeUuid,
            agent.projectUuid,
        );

        const originalExplores = await this.projectModel.findExploresFromCache(
            agent.projectUuid,
            'name',
            originalChangeset.changes.map((c) => c.entityTableName),
        );

        await this.changesetModel.revertChange(changeUuid, agent.projectUuid);

        await this.catalogModel.indexCatalogReverts({
            projectUuid: agent.projectUuid,
            revertedChanges: [change],
            originalChangeset,
            originalExplores,
        });
        const toolResults =
            await this.aiAgentModel.getToolResultsForPrompt(promptUuid);

        // Find the tool result for the propose_change that created this change
        const proposeChangeResult = toolResults
            .filter(isToolProposeChangeSuccessResult)
            .find((result) => result.metadata.changeUuid === changeUuid);

        if (!proposeChangeResult) {
            throw new NotFoundError(
                `Propose change result not found for change: ${changeUuid}`,
            );
        }

        await this.aiAgentModel.updateToolResultMetadata(
            promptUuid,
            proposeChangeResult.toolCallId,
            {
                ...proposeChangeResult.metadata,
                userFeedback: 'rejected',
            },
        );
    }

    private async updateSlackResponseWithProgress(
        slackPrompt: SlackPrompt,
        progress: string,
    ) {
        await this.slackClient.updateMessage({
            organizationUuid: slackPrompt.organizationUuid,
            text: progress,
            blocks: getThinkingBlocks(progress, this.lightdashConfig.siteUrl),
            channelId: slackPrompt.slackChannelId,
            messageTs: slackPrompt.response_slack_ts,
        });
    }

    private async getAgentSettings(
        user: SessionUser,
        prompt: SlackPrompt | AiWebAppPrompt,
    ): Promise<AiAgent> {
        if (!user.organizationUuid) {
            throw new Error('Organization not found');
        }

        // Priority: Use agentUuid if available (set by multi-agent channel selection or web app)
        // Fallback: Get agent by slack channel ID for single-agent channels
        if (prompt.agentUuid) {
            return this.aiAgentModel.getAgent({
                organizationUuid: user.organizationUuid,
                agentUuid: prompt.agentUuid,
            });
        }

        if ('slackChannelId' in prompt) {
            return this.aiAgentModel.getAgentBySlackChannelId({
                organizationUuid: user.organizationUuid,
                slackChannelId: prompt.slackChannelId,
            });
        }

        // This should not happen, but handle it anyway
        throw new Error(
            'Cannot determine agent: no agentUuid or slackChannelId',
        );
    }

    async retrieveRelevantArtifacts({
        promptUuid,
        organizationUuid,
        projectUuid,
        agentUuid,
        searchQuery,
    }: {
        promptUuid: string;
        organizationUuid: string;
        projectUuid: string;
        agentUuid: string;
        searchQuery: string;
    }): Promise<
        {
            artifactVersionUuid: string;
            chartConfig: Record<string, unknown>;
            artifactType: 'chart' | 'dashboard';
        }[]
    > {
        const existingRefs =
            await this.aiAgentModel.findArtifactReferencesByPromptUuid(
                promptUuid,
            );

        if (existingRefs.length > 0) {
            return this.aiAgentModel.getArtifactVersionsByUuids(existingRefs);
        }

        const { relevantVerifiedAnswers } =
            await this.getRelevantVerifiedAnswerContext({
                organizationUuid,
                projectUuid,
                agentUuid,
                searchQuery,
                limit: 3,
            });

        if (relevantVerifiedAnswers.length > 0) {
            await this.aiAgentModel.recordArtifactReferences({
                promptUuid,
                projectUuid,
                artifactReferences: relevantVerifiedAnswers.map((answer) => ({
                    artifactVersionUuid: answer.artifactVersionUuid,
                    similarityScore: answer.similarity,
                })),
            });

            const averageSimilarity =
                relevantVerifiedAnswers.reduce(
                    (sum, answer) => sum + answer.similarity,
                    0,
                ) / relevantVerifiedAnswers.length;

            this.analytics.track<AiAgentArtifactsRetrievedEvent>({
                event: 'ai_agent.artifacts_retrieved',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    agentId: agentUuid,
                    promptId: promptUuid,
                    artifactCount: relevantVerifiedAnswers.length,
                    averageSimilarity,
                },
            });
        }

        return relevantVerifiedAnswers;
    }

    async getRelevantVerifiedAnswerContextForAgent(
        user: SessionUser,
        {
            projectUuid,
            agentUuid,
            searchQuery,
            limit = 3,
        }: {
            projectUuid: string;
            agentUuid: string;
            searchQuery: string;
            limit?: number;
        },
    ): Promise<RelevantVerifiedAnswerContext> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        await this.getAgent(user, agentUuid, projectUuid);

        return this.getRelevantVerifiedAnswerContext({
            organizationUuid,
            projectUuid,
            agentUuid,
            searchQuery,
            limit,
        });
    }

    async getRelevantVerifiedAnswerContext({
        organizationUuid,
        projectUuid,
        agentUuid,
        searchQuery,
        limit = 3,
    }: {
        organizationUuid: string;
        projectUuid: string;
        agentUuid: string;
        searchQuery: string;
        limit?: number;
    }): Promise<RelevantVerifiedAnswerContext> {
        const embeddingResult = await generateEmbedding(
            searchQuery,
            this.lightdashConfig,
        );
        if (!embeddingResult) {
            return { relevantVerifiedAnswers: [] };
        }
        const {
            embedding: queryEmbedding,
            provider,
            modelName,
        } = embeddingResult;

        const verifiedArtifacts =
            await this.aiAgentModel.searchArtifactsBySimilarity({
                organizationUuid,
                projectUuid,
                agentUuid,
                queryEmbedding,
                embeddingModelProvider: provider,
                embeddingModel: modelName,
                limit,
            });

        return { relevantVerifiedAnswers: verifiedArtifacts };
    }

    static createRelevantArtifactsMessage(
        artifacts: {
            chartConfig: Record<string, unknown>;
            artifactType: 'chart' | 'dashboard';
        }[],
    ): UserModelMessage {
        const ragContext = artifacts
            .map(
                (artifact, index) =>
                    `\`\`\`json\n${JSON.stringify(
                        artifact.chartConfig,
                        null,
                        2,
                    )}\`\`\`\n`,
            )
            .join('\n\n');

        return {
            role: 'user',
            content: `\
Here are some relevant queries from previous conversations:
${ragContext}
Use them as a reference, but do all the due dilligence and follow the instructions outlined above`,
        } satisfies UserModelMessage;
    }

    static createPinnedContextMessage(
        context: AiPromptContext,
    ): UserModelMessage | null {
        if (context.length === 0) return null;

        const lines = context.map((item) => {
            const name = item.displayName ?? '(name unavailable)';
            switch (item.type) {
                case 'chart': {
                    const slugText = item.chartSlug ?? '(slug unavailable)';
                    const headline = `- Chart "${name}" (chartSlug: ${slugText})`;
                    const overrides = item.runtimeOverrides;
                    if (!overrides) return headline;
                    const overrideLines: string[] = [];
                    if (overrides.dashboardFilters) {
                        overrideLines.push(
                            `    Dashboard filters: ${JSON.stringify(overrides.dashboardFilters)}`,
                        );
                    }
                    if (overrides.dashboardParameters) {
                        overrideLines.push(
                            `    Parameter values: ${JSON.stringify(overrides.dashboardParameters)}`,
                        );
                    }
                    if (overrides.dateZoom) {
                        overrideLines.push(
                            `    Date zoom: ${JSON.stringify(overrides.dateZoom)}`,
                        );
                    }
                    if (overrideLines.length === 0) return headline;
                    return `${headline}\n  Runtime overrides applied when the chart was pinned:\n${overrideLines.join('\n')}`;
                }
                case 'dashboard':
                    return `- Dashboard "${name}" (dashboardSlug: ${item.dashboardSlug ?? '(slug unavailable)'})`;
                case 'thread':
                    return `- Conversation "${name}" (threadUuid: ${item.threadUuid}${
                        item.promptUuid
                            ? `, the referenced turn is promptUuid: ${item.promptUuid}`
                            : ''
                    }) — a previous conversation attached as reference. Read it with the readPinnedThread tool. It may predate recent project changes, so verify any claims it contains against the current project instead of trusting them.`;
                default:
                    return assertUnreachable(
                        item,
                        'Unknown AiPromptContextItem type',
                    );
            }
        });

        return {
            role: 'user',
            content: `\
The user attached the following to this message as context:
${lines.join('\n')}

Use your existing tools to inspect them when relevant to the user's question. When runtime overrides are listed, apply them on top of the chart's saved state when querying.`,
        } satisfies UserModelMessage;
    }

    async getChatHistoryFromThreadMessages(
        // TODO: move getThreadMessages to AiAgentModel and improve types
        // also, it should be called through a service method...
        threadMessages: Awaited<
            ReturnType<typeof AiAgentModel.prototype.getThreadMessages>
        >,
        options: {
            organizationUuid: string;
            projectUuid: string;
            agentUuid: string;
            retrieveRelevantArtifacts: boolean;
            compaction: ThreadCompaction | null;
        },
    ): Promise<ModelMessage[]> {
        const contextMap = await this.aiAgentModel.getContextForPromptUuids(
            threadMessages.map((m) => m.ai_prompt_uuid),
        );

        const messagesWithToolCalls = await Promise.all(
            threadMessages.map(async (message, index) => {
                const messages: ModelMessage[] = [
                    {
                        role: 'user',
                        content: message.prompt,
                    } satisfies UserModelMessage,
                ];

                const pinnedContextMessage =
                    AiAgentService.createPinnedContextMessage(
                        contextMap.get(message.ai_prompt_uuid) ?? [],
                    );
                if (pinnedContextMessage) {
                    messages.push(pinnedContextMessage);
                }

                // Inject relevant verified artifacts after first user prompt (search or retrieve cached)
                if (index === 0 && options.retrieveRelevantArtifacts) {
                    try {
                        const artifacts = await this.retrieveRelevantArtifacts({
                            agentUuid: options.agentUuid,
                            promptUuid: message.ai_prompt_uuid,
                            organizationUuid: options.organizationUuid,
                            projectUuid: options.projectUuid,
                            searchQuery: message.prompt,
                        });

                        if (artifacts.length > 0) {
                            messages.push(
                                AiAgentService.createRelevantArtifactsMessage(
                                    artifacts,
                                ),
                            );
                        }
                    } catch (error) {
                        Logger.error(
                            `Failed to retrieve relevant artifacts for prompt ${message.ai_prompt_uuid}`,
                            error,
                        );
                        Sentry.captureException(error);
                    }
                }

                const toolCallsAndResults =
                    await this.aiAgentModel.getToolCallsAndResultsForPrompt(
                        message.ai_prompt_uuid,
                    );
                const toolCallmessages = toolCallsAndResults.flatMap(
                    ({ toolCall, toolResult }) => [
                        {
                            role: 'assistant',
                            content: [
                                {
                                    type: 'tool-call' as const,
                                    toolCallId: toolCall.toolCallId,
                                    toolName: toolCall.toolName,
                                    input: toolCall.toolArgs,
                                },
                            ] satisfies ToolCallPart[],
                        } satisfies AssistantModelMessage,
                        {
                            role: 'tool',
                            content: [
                                {
                                    type: 'tool-result',
                                    toolCallId: toolResult.toolCallId,
                                    toolName: toolResult.toolName,
                                    output:
                                        isToolProposeChangeSuccessResult(
                                            toolResult,
                                        ) &&
                                        toolResult.metadata.userFeedback ===
                                            'rejected'
                                            ? {
                                                  type: 'json',
                                                  value: `${toolResult.result}\nUser rejected proposed change.`,
                                              }
                                            : {
                                                  type: 'json',
                                                  // TODO :: based on tool, if there's a need for it we can use the metadata here
                                                  value: toolResult.result,
                                              },
                                },
                            ],
                        } satisfies ToolModelMessage,
                    ],
                );

                messages.push(...toolCallmessages);

                if (message.response && !message.error_message) {
                    messages.push({
                        role: 'assistant',
                        content: message.response,
                    } satisfies AssistantModelMessage);
                }

                if (message.human_score) {
                    let feedbackContent =
                        // TODO: we don't have a neutral option, we are storing -1 and 1 at the moment
                        message.human_score > 0
                            ? 'I liked this response'
                            : 'I did not like this response';

                    if (message.human_feedback) {
                        feedbackContent += `\nReasoning: ${message.human_feedback}`;
                    }

                    messages.push({
                        role: 'user',
                        content: feedbackContent,
                    } satisfies UserModelMessage);
                }

                return messages;
            }),
        );

        const history = messagesWithToolCalls.flat();

        if (!options.compaction) {
            return history;
        }

        // `agentV2.getAgentMessages()` prepends the canonical system prompt first,
        // so the compaction summary is injected immediately after that prompt.
        return [
            Compaction.createSummaryMessage(options.compaction.summary),
            ...history,
        ];
    }

    // Defines the functions that AI Agent tools can use to interact with the Lightdash backend or slack
    // This is scoped to the project, user and prompt (closure)
    private async getAiAgentDependencies(
        user: SessionUser,
        prompt: SlackPrompt | AiWebAppPrompt,
        options?: {
            // Receives the same coarse step-progress strings ("Running your
            // query…", "Starting sandbox…") that Slack overwrites into the
            // pinned "Thinking…" message, along with the tool they belong to
            // so the web client can scope an inline progress row to the active
            // tool. Only invoked for web prompts; Slack prompts route through
            // updateSlackResponseWithProgress instead.
            onStepProgress?: (progress: string, toolName?: string) => void;
        },
    ) {
        const { projectUuid, organizationUuid } = prompt;
        const runtimeAgentSettings = await this.getAgentSettings(user, prompt);
        const toolsRuntime = this.aiAgentToolsService.createRuntime({
            user,
            account: fromSession(user),
            organizationUuid,
            projectUuid,
            source: 'ai_agent',
            catalogSearchContext: CatalogSearchContext.AI_AGENT,
            defaultQueryExecutionContext: QueryExecutionContext.AI,
            tags: runtimeAgentSettings.tags,
            spaceAccess: runtimeAgentSettings.spaceAccess,
            agentUuid: runtimeAgentSettings.uuid,
        });

        const getProjectContextDocument: AiAgentDependencies['getProjectContextDocument'] =
            () => this.projectContextModel.getDocument(projectUuid);

        const updateProgress: UpdateProgressFn = (progress, toolName) => {
            if (isSlackPrompt(prompt)) {
                return this.updateSlackResponseWithProgress(prompt, progress);
            }
            // Web prompts surface step progress through a transient
            // `data-step-progress` chunk on the SSE stream (see
            // generateOrStreamAgentResponse). The callback is wired only
            // when streaming; non-stream responses silently drop these
            // events.
            options?.onStepProgress?.(progress, toolName);
            return Promise.resolve();
        };

        const getPrompt: GetPromptFn = async () => {
            const webOrSlackPrompt = isSlackPrompt(prompt)
                ? await this.aiAgentModel.findSlackPrompt(prompt.promptUuid)
                : await this.aiAgentModel.findWebAppPrompt(prompt.promptUuid);

            if (!webOrSlackPrompt) {
                throw new Error('Prompt not found');
            }
            return webOrSlackPrompt;
        };

        const sendFile: SendFileFn = (args) =>
            wrapSentryTransaction('AiAgent.sendFile', args, () =>
                //
                // TODO: https://api.slack.com/methods/files.upload does not support setting custom usernames
                // support this in the future
                //
                // const agent = agentUuid
                //     ? await this.aiAgentService.getAgent(user, agentUuid)
                //     : undefined;
                // let username: string | undefined;
                // if (agent) {
                //     username = agent.name;
                // }
                //

                this.slackClient.postFileToThread(args),
            );

        const sendSlackBlocks: SendSlackBlocksFn = async (args) =>
            wrapSentryTransaction(
                'AiAgent.sendSlackBlocks',
                { channelId: args.channelId },
                async () => {
                    const response = await this.slackClient.postMessage({
                        organizationUuid: args.organizationUuid,
                        channel: args.channelId,
                        thread_ts: args.threadTs,
                        text: args.text,
                        blocks: args.blocks,
                    });
                    return { ts: (response?.ts ?? '') as string };
                },
            );

        const updateSlackMessage: UpdateSlackMessageFn = async (args) =>
            wrapSentryTransaction(
                'AiAgent.updateSlackMessage',
                { channelId: args.channelId },
                async () => {
                    const webClient = await this.slackClient.getWebClient(
                        args.organizationUuid,
                    );
                    await webClient.chat.update({
                        channel: args.channelId,
                        ts: args.ts,
                        text: args.text,
                        blocks: args.blocks,
                    });
                },
            );

        const storeToolCall: StoreToolCallFn = async (args) => {
            void wrapSentryTransaction(
                'AiAgent.storeToolCall',
                {
                    promptUuid: args.promptUuid,
                    toolCallId: args.toolCallId,
                    toolName: args.toolName,
                },
                () => this.aiAgentModel.createToolCall(args),
            );
        };

        const storeToolResults: StoreToolResultsFn = async (args) => {
            void wrapSentryTransaction(
                'AiAgent.storeToolResults',
                args.map((arg) => ({
                    promptUuid: arg.promptUuid,
                    toolCallId: arg.toolCallId,
                    toolName: arg.toolName,
                })),
                () => this.aiAgentModel.createToolResults(args),
            );
        };

        const storeReasoning: StoreReasoningFn = async (
            promptUuid,
            reasonings,
        ) => {
            void wrapSentryTransaction(
                'AiAgent.storeReasoning',
                {
                    promptUuid,
                    reasoningCount: reasonings.length,
                },
                () => this.aiAgentModel.createReasoning(promptUuid, reasonings),
            );
        };

        const editDbtProject: EditDbtProjectFn = async (args) => {
            // Stream coarse progress back to the user so they can see what
            // the writeback is doing (Starting sandbox → Cloning project →
            // Discovering models → Editing models → Compiling project →
            // Committing → …). For Slack this overwrites the pinned
            // "Thinking…" message; for web it surfaces as a transient
            // `data-step-progress` chunk on the SSE stream. Tagged with the
            // `editDbtProject` tool name so the web client only renders
            // these under the writeback header — never a concurrently running
            // tool's progress. Fire-and-forget — a Slack rate limit, deleted
            // message, or dropped SSE client must never take down the
            // writeback itself.
            const writebackProgressCallback = (message: string) => {
                void updateProgress(message, 'editDbtProject').catch((err) => {
                    Logger.debug(
                        `Failed to update progress for writeback (${message}):`,
                        err,
                    );
                });
            };

            // When the user asks to write back their changeset, build the
            // instructions deterministically from the active changeset's
            // structured changes instead of trusting the LLM-composed prompt.
            let writebackPrompt: string;
            let source: AiWritebackSource;
            if (args.fromActiveChangeset) {
                const changeset =
                    await this.changesetModel.findActiveChangesetWithChangesByProjectUuid(
                        projectUuid,
                    );
                if (!changeset || changeset.changes.length === 0) {
                    throw new ParameterError(
                        'There are no changes to write back for this project',
                    );
                }
                writebackPrompt = buildChangesetWritebackPrompt(changeset);
                source = 'changeset';
            } else {
                if (!args.prompt) {
                    throw new ParameterError(
                        'A writeback prompt is required when fromActiveChangeset is false',
                    );
                }
                writebackPrompt = args.prompt;
                source = isSlackPrompt(prompt) ? 'slack' : 'web';
            }

            const result = await wrapSentryTransaction(
                'AiAgent.editDbtProject',
                {},
                () =>
                    this.aiWritebackService.run({
                        user,
                        projectUuid,
                        prompt: writebackPrompt,
                        prUrl: args.prUrl,
                        aiThreadUuid: prompt.threadUuid,
                        source,
                        onProgress: writebackProgressCallback,
                    }),
            );
            // On a successful PR open/update, add a green-tick reaction to the
            // user's original Slack mention so they see the outcome at a
            // glance without scrolling through the agent's reply. Best-effort
            // — installs missing `reactions:write` (or any other transient
            // failure) silently skip the reaction.
            if (result.prUrl && isSlackPrompt(prompt)) {
                void this.slackClient
                    .addReaction({
                        organizationUuid,
                        channel: prompt.slackChannelId,
                        timestamp: prompt.promptSlackTs,
                        name: 'white_check_mark',
                    })
                    .catch((err) => {
                        Logger.debug(
                            'Failed to add :white_check_mark: reaction to writeback mention:',
                            err,
                        );
                    });
            }
            // Resolve the repo's preview-deploy CI status once (best-effort,
            // gated by the ai-preview-deploy-setup flag). It drives the
            // deterministic "offer to set it up" instruction the editDbtProject
            // tool relays when no server-side preview could be built. Owned by
            // the sibling PreviewDeploySetupService — writeback no longer
            // detects this itself. Never fails the writeback result.
            let previewDeployConfigured: boolean | null = null;
            try {
                const { enabled: previewDeploySetupEnabled } =
                    await this.featureFlagService.get({
                        user,
                        featureFlagId: FeatureFlags.AiPreviewDeploySetup,
                    });
                if (previewDeploySetupEnabled) {
                    const ciStatus =
                        await this.previewDeploySetupService.getOrScanProjectCiStatus(
                            user,
                            projectUuid,
                        );
                    previewDeployConfigured = ciStatus
                        ? ciStatus.hasPreviewDeployWorkflow
                        : null;
                }
            } catch (err) {
                Logger.debug(
                    'Failed to resolve preview-deploy CI status after writeback:',
                    err,
                );
            }

            // Server-side preview: for GitHub-connected projects, build the
            // preview ourselves from the PR's head branch and post its URL on
            // the PR — no CI in the customer repo required. The URL is returned
            // to the editDbtProject tool so the agent's reply (web chat and
            // Slack alike) links the preview directly; this replaced the old
            // pollWritebackPreview job that scanned PR comments for a
            // CI-posted URL. Returns null for unsupported projects (e.g.
            // CLI-deployed) or on any failure — those surface no preview.
            let previewUrl: string | null = null;
            if (result.prUrl) {
                const preview =
                    await this.writebackPreviewService.createPreviewForPullRequest(
                        { user, projectUuid, prUrl: result.prUrl },
                    );
                previewUrl = preview?.previewUrl ?? null;
            }

            return { ...result, previewDeployConfigured, previewUrl };
        };

        // Read-only repo virtual filesystem for the repoShell tool. Resolve the
        // GitHub access + fetch the file tree at most once per request, then
        // reuse the cached RepoFs across every repoShell call in the run.
        let repoFsPromise: Promise<RepoFs> | null = null;
        const repoShell: RepoShellFn = async ({ command }) => {
            if (!repoFsPromise) {
                repoFsPromise = this.aiWritebackService
                    .getRepoReadAccess({ user, projectUuid })
                    .then(
                        (access) =>
                            new RepoFs(
                                createGithubRepoSource({
                                    ...access,
                                    onTiming: (event) => {
                                        if (event.kind === 'tree') {
                                            this.prometheusMetrics?.observeRepoFsGithubTreeDuration(
                                                event.durationMs,
                                            );
                                        } else {
                                            this.prometheusMetrics?.observeRepoFsGithubFileDuration(
                                                event.durationMs,
                                                event.outcome,
                                            );
                                        }
                                    },
                                }),
                            ),
                    );
            }
            const repoFs = await repoFsPromise;
            return runRepoShellCommand(repoFs, command);
        };

        return {
            listExplores: toolsRuntime.listExplores,
            getProjectContextDocument,
            getExplore: toolsRuntime.getExplore,
            listContent: toolsRuntime.listContent,
            findContent: toolsRuntime.findContent,
            readContent: toolsRuntime.readContent,
            editContent: toolsRuntime.editContent,
            createContent: toolsRuntime.createContent,
            validateContent: toolsRuntime.validateContent,
            getDashboardCharts: toolsRuntime.getDashboardCharts,
            findFields: toolsRuntime.findFields,
            findExplores: toolsRuntime.findExplores,
            searchSemanticLayer: toolsRuntime.searchSemanticLayer,
            updateProgress,
            getPrompt,
            runAsyncQuery: toolsRuntime.runAsyncQuery,
            runSavedChartQuery: toolsRuntime.runSavedChartQuery,
            runSqlJob: toolsRuntime.runSqlJob,
            listWarehouseTables: toolsRuntime.listWarehouseTables,
            describeWarehouseTable: toolsRuntime.describeWarehouseTable,
            listKnowledgeDocuments: toolsRuntime.listKnowledgeDocuments,
            getKnowledgeDocumentContent:
                toolsRuntime.getKnowledgeDocumentContent,
            getSavedChart: toolsRuntime.getSavedChart,
            sendFile,
            sendSlackBlocks,
            updateSlackMessage,
            storeToolCall,
            storeToolResults,
            storeReasoning,
            searchFieldValues: toolsRuntime.searchFieldValues,
            editDbtProject,
            setupPreviewDeploy: toolsRuntime.setupPreviewDeploy,
            repoShell,
            listProjects: toolsRuntime.listProjects,
            getProjectInfo: toolsRuntime.getProjectInfo,
            loadSkill: toolsRuntime.loadSkill,
        };
    }

    async generateOrStreamAgentResponse(
        user: SessionUser,
        messageHistory: ModelMessage[],
        options: {
            prompt: AiWebAppPrompt;
            stream: true;
            canManageAgent: boolean;
            enableSqlMode?: boolean;
            autoApproveSql?: boolean;
            toolHints?: string[];
        },
    ): Promise<AgentResponseStream>;
    async generateOrStreamAgentResponse(
        user: SessionUser,
        messageHistory: ModelMessage[],
        options: {
            prompt: AiWebAppPrompt;
            stream: false;
            canManageAgent: boolean;
            enableSqlMode?: boolean;
            autoApproveSql?: boolean;
            toolHints?: string[];
        },
    ): Promise<string>;
    async generateOrStreamAgentResponse(
        user: SessionUser,
        messageHistory: ModelMessage[],
        options: {
            prompt: SlackPrompt;
            stream: false;
            canManageAgent: boolean;
            enableSqlMode?: boolean;
            autoApproveSql?: boolean;
            toolHints?: string[];
        },
    ): Promise<string>;
    async generateOrStreamAgentResponse(
        user: SessionUser,

        messageHistory: ModelMessage[],
        options: {
            canManageAgent: boolean;
            enableSqlMode?: boolean;
            autoApproveSql?: boolean;
            toolHints?: string[];
        } & (
            | {
                  prompt: AiWebAppPrompt;
                  stream: true;
              }
            | {
                  prompt: SlackPrompt;
                  stream: false;
              }
            | {
                  prompt: AiWebAppPrompt;
                  stream: false;
              }
        ),
    ): Promise<string | AgentResponseStream> {
        if (!user.organizationUuid) {
            throw new Error('Organization not found');
        }

        if (!(await this.getIsCopilotEnabled(user))) {
            throw new Error('AI Copilot is not enabled');
        }

        const { prompt, stream } = options;

        // Web prompts get a transient `data-step-progress` channel on the
        // SSE stream so the bubble can show "Starting sandbox…" /
        // "Cloning project…" as the active step under the running tool,
        // matching what Slack already gets via
        // updateSlackResponseWithProgress. Only created when streaming —
        // non-stream (web) responses have nowhere to flush progress to. The
        // listener is attached below inside createUIMessageStream, before
        // the agent's stream starts pulling.
        const stepProgressEmitter =
            stream && !isSlackPrompt(prompt) ? new EventEmitter() : undefined;

        const {
            listExplores,
            getProjectContextDocument,
            getExplore,
            listContent,
            findContent,
            readContent,
            editContent,
            createContent,
            validateContent,
            getDashboardCharts,
            findFields,
            findExplores,
            searchSemanticLayer,
            updateProgress,
            getPrompt,
            runAsyncQuery,
            runSavedChartQuery,
            runSqlJob,
            listWarehouseTables,
            describeWarehouseTable,
            listKnowledgeDocuments,
            getKnowledgeDocumentContent,
            getSavedChart,
            sendFile,
            sendSlackBlocks,
            updateSlackMessage,
            storeToolCall,
            storeToolResults,
            storeReasoning,
            searchFieldValues,
            editDbtProject,
            setupPreviewDeploy,
            repoShell,
            listProjects,
            getProjectInfo,
        } = await this.getAiAgentDependencies(user, prompt, {
            onStepProgress: stepProgressEmitter
                ? (progress, toolName) =>
                      stepProgressEmitter.emit('stepProgress', {
                          message: progress,
                          toolName,
                      })
                : undefined,
        });

        const enableSqlMode = options.enableSqlMode ?? false;

        // Permission-sensitive tools need the prompt actor to be the real
        // sender. Web prompts always are; Slack prompts are only trusted when
        // Slack OAuth is required, otherwise the actor is the workspace
        // installer.
        let hasTrustedPromptUserIdentity = true;
        if (isSlackPrompt(prompt) && user.organizationUuid) {
            const slackSettings =
                await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                    user.organizationUuid,
                );
            hasTrustedPromptUserIdentity = !!slackSettings?.aiRequireOAuth;
        }
        const promptProject = await this.projectModel.get(prompt.projectUuid);

        let canRunSql = enableSqlMode;
        // Fail closed when CASL would evaluate against the installer.
        if (canRunSql && !hasTrustedPromptUserIdentity) {
            this.logger.info(
                `Disabling runSql for Slack prompt ${prompt.promptUuid} because aiRequireOAuth is off.`,
            );
            canRunSql = false;
        }

        // Require the same CASL ability the SQL Runner page uses. The check
        // also fires deep in AsyncQueryService.executeAsyncSqlQuery, but
        // gating here means the tool isn't even registered with the model
        // for users without the scope — cleaner UX than a ForbiddenError
        // mid-tool-call.
        if (canRunSql) {
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'manage',
                    subject('SqlRunner', {
                        organizationUuid: promptProject.organizationUuid,
                        projectUuid: promptProject.projectUuid,
                        metadata: {
                            promptUuid: prompt.promptUuid,
                            threadUuid: prompt.threadUuid,
                            agentUuid: prompt.agentUuid,
                        },
                    }),
                )
            ) {
                canRunSql = false;
            }
        }

        const warehouseCredentials = canRunSql
            ? await this.projectModel.getWarehouseCredentialsForProject(
                  prompt.projectUuid,
              )
            : null;
        const warehouseType = warehouseCredentials?.type ?? null;
        const warehouseSchema = warehouseCredentials
            ? ('schema' in warehouseCredentials &&
                  warehouseCredentials.schema) ||
              ('dataset' in warehouseCredentials &&
                  'project' in warehouseCredentials &&
                  `${warehouseCredentials.project}.${warehouseCredentials.dataset}`) ||
              ('database' in warehouseCredentials &&
                  warehouseCredentials.database) ||
              null
            : null;

        const agentSettings = await this.getAgentSettings(user, prompt);
        const knowledgeDocuments =
            await this.aiAgentDocumentModel.findAllForAgent({
                organizationUuid: user.organizationUuid,
                agentUuid: agentSettings.uuid,
                projectUuid: prompt.projectUuid,
            });
        const agentMcpServersWithSensitiveData =
            await this.refreshGithubMcpCredentials(
                user.organizationUuid,
                await this.aiAgentModel.getAgentMcpServersWithSensitiveData(
                    agentSettings.uuid,
                    user.userUuid,
                ),
            );
        const mcpServers = this.aiAgentMcpRuntimeClient.attachRuntimeProviders({
            projectUuid: prompt.projectUuid,
            userUuid: user.userUuid,
            mcpServers: await Promise.all(
                agentMcpServersWithSensitiveData.map(async (mcpServer) => ({
                    ...mcpServer,
                    enabledToolNames:
                        await this.aiAgentModel.getEnabledMcpServerToolNames({
                            agentUuid: agentSettings.uuid,
                            serverUuid: mcpServer.uuid,
                        }),
                })),
            ),
        });
        const { enabled: agentRevampEnabled } =
            await this.featureFlagService.get({
                user,
                featureFlagId: FeatureFlags.AiAgentRevamp,
            });
        const { enabled: searchSemanticLayerEnabled } =
            await this.featureFlagService.get({
                user,
                featureFlagId: FeatureFlags.SearchSemanticLayer,
            });
        let { enabled: aiWritebackEnabled } = await this.featureFlagService.get(
            {
                user,
                featureFlagId: FeatureFlags.AiWriteback,
            },
        );
        if (aiWritebackEnabled && !hasTrustedPromptUserIdentity) {
            this.logger.info(
                `Disabling editDbtProject for Slack prompt ${prompt.promptUuid} because aiRequireOAuth is off.`,
            );
            aiWritebackEnabled = false;
        }
        // Writeback opens a pull request and only supports GitHub and GitLab
        // dbt connections (see AiWritebackService.getGitProvider, which throws
        // for any other type). Without this guard the agent would expose the
        // writeback section + editDbtProject tool — and offer to open PRs — on
        // projects where editDbtProject can only fail.
        const writebackSupportedConnection =
            promptProject.dbtConnection.type === DbtProjectType.GITHUB ||
            promptProject.dbtConnection.type === DbtProjectType.GITLAB;
        if (aiWritebackEnabled && !writebackSupportedConnection) {
            aiWritebackEnabled = false;
        }

        // Advisory signal of which GitHub identity a writeback PR would be
        // attributed to, so the prompt can tell the user and nudge unlinked
        // users to link their personal GitHub. GitHub-only (GitLab uses a
        // project PAT, no personal linking) and only when the org has the app
        // installed. Wrapped in try/catch and degraded to null so an attribution
        // lookup can never block a chat turn.
        let writebackAttribution: AiWritebackAttribution | null = null;
        if (
            aiWritebackEnabled &&
            promptProject.dbtConnection.type === DbtProjectType.GITHUB &&
            user.organizationUuid
        ) {
            try {
                const installationId =
                    await this.githubAppInstallationsModel.findInstallationId(
                        user.organizationUuid,
                    );
                if (installationId) {
                    writebackAttribution =
                        await this.githubAppService.getAiWritebackAttribution(
                            user,
                        );
                }
            } catch (error) {
                this.logger.warn(
                    `Failed to resolve AI writeback attribution for prompt ${prompt.promptUuid}; continuing without it. ${getErrorMessage(
                        error,
                    )}`,
                );
                writebackAttribution = null;
            }
        }

        const projectContextEnabled =
            aiWritebackEnabled &&
            (await this.aiOrganizationSettingsService.isAiAgentReviewsEnabled(
                user,
            ));
        const projectContext = projectContextEnabled
            ? await this.projectContextModel.getDocument(prompt.projectUuid)
            : [];

        // Preview-deploy setup rides the writeback infra, so it requires both
        // the writeback flag (and trusted identity, applied above) and its own
        // ai-preview-deploy-setup flag.
        const { enabled: aiPreviewDeploySetupFlag } =
            await this.featureFlagService.get({
                user,
                featureFlagId: FeatureFlags.AiPreviewDeploySetup,
            });
        const aiPreviewDeploySetupEnabled =
            aiWritebackEnabled && aiPreviewDeploySetupFlag;

        let { enabled: repoFsEnabled } = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.RepoFs,
        });
        // repoShell reads repo source and its view:SourceCode check evaluates
        // against the resolved user. On Slack without aiRequireOAuth that user
        // is the app installer, not the requester — so disable it, exactly as
        // runSql and writeback do above.
        if (repoFsEnabled && !hasTrustedPromptUserIdentity) {
            this.logger.info(
                `Disabling repoShell for Slack prompt ${prompt.promptUuid} because aiRequireOAuth is off.`,
            );
            repoFsEnabled = false;
        }

        // The dbt project's root within the repo, so the prompt can point the
        // repoShell agent at it (instead of hardcoding "dbt/"). Derived from the
        // connection's project_sub_path: '.' = repo root, else a subdirectory.
        // null when repoFs is off or the project isn't git-backed.
        let repoFsRoot: string | null = null;
        if (
            repoFsEnabled &&
            'project_sub_path' in promptProject.dbtConnection
        ) {
            const raw = (promptProject.dbtConnection.project_sub_path ?? '')
                .trim()
                .replace(/^\/+/, '')
                .replace(/\/+$/, '');
            repoFsRoot = raw === '' ? '.' : raw;
        }

        const canUseContentTools =
            agentRevampEnabled &&
            agentSettings.enableContentTools &&
            hasTrustedPromptUserIdentity &&
            this.createAuditedAbility(user).can(
                'manage',
                subject('ContentAsCode', {
                    organizationUuid: promptProject.organizationUuid,
                    projectUuid: promptProject.projectUuid,
                    metadata: {
                        promptUuid: prompt.promptUuid,
                        threadUuid: prompt.threadUuid,
                        agentUuid: agentSettings.uuid,
                    },
                }),
            );
        const availableSkills = canUseContentTools
            ? await this.aiAgentToolsService.listAgentSkills()
            : [];
        const modelProperties = getModel(this.lightdashConfig.ai.copilot, {
            enableReasoning: prompt.modelConfig?.reasoning,
            modelName: prompt.modelConfig?.modelName,
            provider: prompt.modelConfig?.modelProvider as AnyType,
        });

        const args: AiAgentArgs = {
            organizationId: user.organizationUuid,
            userId: user.userUuid,

            ...modelProperties,

            agentSettings,
            knowledgeDocuments,
            projectContext,
            projectContextEnabled,
            mcpServers,

            messageHistory,
            threadUuid: prompt.threadUuid,
            promptUuid: prompt.promptUuid,

            debugLoggingEnabled:
                this.lightdashConfig.ai.copilot.debugLoggingEnabled,
            telemetryEnabled: this.lightdashConfig.ai.copilot.telemetryEnabled,
            enableDataAccess: agentSettings.enableDataAccess,
            enableSelfImprovement: agentSettings.enableSelfImprovement,
            enableContentTools: canUseContentTools,
            enableSearchSemanticLayer: searchSemanticLayerEnabled,
            enableAiWriteback: aiWritebackEnabled,
            writebackAttribution,
            enablePreviewDeploySetup: aiPreviewDeploySetupEnabled,
            enableRepoFs: repoFsEnabled,
            repoFsRoot,
            canRunSql,
            autoApproveSql: options.autoApproveSql ?? false,
            autoApproveSqlUserUuid: options.autoApproveSql
                ? user.userUuid
                : null,
            warehouseType,
            warehouseSchema,
            availableSkills,
            enableAgentRevamp: agentRevampEnabled,

            findExploresFieldSearchSize: 200,
            findFieldsPageSize: 30,
            getDashboardChartsPageSize: 20,
            maxQueryLimit: this.lightdashConfig.ai.copilot.maxQueryLimit,
            runSqlMaxLimit: this.lightdashConfig.ai.copilot.runSqlMaxLimit,
            siteUrl: this.lightdashConfig.siteUrl,
            canManageAgent: options.canManageAgent,
            toolHints: options.toolHints ?? [],
        };

        const mcpToolSetup: AgentMcpToolSetup =
            await this.aiAgentMcpRuntimeClient.resolveTools({
                mcpServers,
                userUuid: user.userUuid,
                debugLoggingEnabled:
                    this.lightdashConfig.ai.copilot.debugLoggingEnabled,
            });

        const dependencies: AiAgentDependencies = {
            listExplores,
            getProjectContextDocument,
            getExplore,
            listContent,
            findContent,
            readContent,
            editContent,
            createContent,
            validateContent,
            getDashboardCharts,
            findFields,
            findExplores,
            searchSemanticLayer,
            runAsyncQuery,
            runSavedChartQuery,
            runSqlJob,
            listWarehouseTables,
            describeWarehouseTable,
            listKnowledgeDocuments,
            getKnowledgeDocumentContent,
            // Only conversations pinned as context on this thread are
            // readable — the pin is the capability grant.
            readPinnedThread: async ({ threadUuid }) => {
                const pinnedThreadUuids =
                    await this.aiAgentModel.findPinnedThreadContextUuids(
                        prompt.threadUuid,
                    );
                if (!pinnedThreadUuids.includes(threadUuid)) {
                    throw new ForbiddenError(
                        'This conversation is not attached as context on this thread',
                    );
                }
                const messages = await this.aiAgentModel.findThreadMessages({
                    organizationUuid: user.organizationUuid!,
                    threadUuid,
                });
                return messages.map((message) => ({
                    role: message.role,
                    message: message.message ?? '',
                    createdAt: message.createdAt,
                }));
            },
            getSavedChart,
            getPrompt,
            sendFile,
            sendSlackBlocks,
            updateSlackMessage,
            storeToolCall,
            storeToolResults,
            storeReasoning,
            searchFieldValues,
            editDbtProject,
            setupPreviewDeploy,
            repoShell,
            listProjects,
            getProjectInfo,
            updateProgress: (progress: string) => updateProgress(progress),
            updatePrompt: (
                update: UpdateSlackResponse | UpdateWebAppResponse,
            ) => {
                const updatePromise =
                    this.aiAgentModel.updateModelResponse(update);

                if (
                    update.errorMessage !== undefined ||
                    update.tokenUsage !== undefined
                ) {
                    void updatePromise
                        .then(() => {
                            this.enqueueReviewClassifierEvent({
                                eventType: 'response_saved',
                                organizationUuid: user.organizationUuid,
                                projectUuid: prompt.projectUuid,
                                agentUuid: agentSettings.uuid,
                                threadUuid: prompt.threadUuid,
                                promptUuid: update.promptUuid,
                                userUuid: user.userUuid,
                            });
                        })
                        .catch((error) => {
                            Logger.error(
                                'Failed to enqueue AI agent review classifier after response save',
                                error,
                            );
                        });
                }

                return updatePromise;
            },
            trackEvent: (
                event:
                    | AiAgentResponseStreamed
                    | AiAgentToolCallEvent
                    | AiAgentFindContentCoverageEvent,
            ) => this.analytics.track(event),

            createOrUpdateArtifact: async (data) => {
                const artifact =
                    await this.aiAgentModel.createOrUpdateArtifact(data);

                return artifact;
            },

            waitForSqlApproval: (toolCallId, timeoutMs) =>
                this.aiAgentModel.waitForSqlApproval(toolCallId, timeoutMs),
            recordSqlApproval: (toolCallId, decision, decidedByUserUuid) =>
                this.aiAgentModel.recordSqlApproval(
                    toolCallId,
                    decision,
                    decidedByUserUuid,
                ),
            loadSkill: async (name) =>
                this.aiAgentToolsService.loadAgentSkill(name),

            perf: {
                measureGenerateResponseTime: (durationMs) => {
                    this.prometheusMetrics?.aiAgentGenerateResponseDurationHistogram?.observe(
                        durationMs,
                    );
                },
                measureStreamResponseTime: (durationMs) => {
                    this.prometheusMetrics?.aiAgentStreamResponseDurationHistogram?.observe(
                        durationMs,
                    );
                },
                measureStreamFirstChunk: (durationMs) => {
                    this.prometheusMetrics?.aiAgentStreamFirstChunkHistogram?.observe(
                        durationMs,
                    );
                },
                measureTTFT: (durationMs, model, mode) => {
                    this.prometheusMetrics?.aiAgentTTFTHistogram?.observe(
                        { model, mode },
                        durationMs,
                    );
                },
            },
        };

        if (!stream) {
            return generateAgentResponse({
                args,
                dependencies,
                mcpToolSetup,
            });
        }

        const result = await streamAgentResponse({
            args,
            dependencies,
            mcpToolSetup,
        });
        // Heartbeat handle for the SSE keepalive (see STREAM_KEEPALIVE_INTERVAL_MS).
        // Cleared in onFinish, and defensively if a write lands after the stream
        // has closed.
        let keepaliveInterval: ReturnType<typeof setInterval> | undefined;
        const clearKeepalive = () => {
            if (keepaliveInterval) {
                clearInterval(keepaliveInterval);
                keepaliveInterval = undefined;
            }
        };
        const streamWithMcpNotices = createUIMessageStream({
            execute: ({ writer }) => {
                for (const unavailableMcpServer of mcpToolSetup.unavailableMcpServers) {
                    writer.write({
                        type: 'data-mcp-unavailable',
                        data: unavailableMcpServer,
                        transient: true,
                    });
                }

                // Keep the connection warm during long, output-silent tool
                // calls so an idle-timeout proxy can't cut the stream (see
                // STREAM_KEEPALIVE_INTERVAL_MS). `transient: true` → never
                // persisted; the client drops unknown transient data parts, so
                // this is invisible. Best-effort: a write after close throws,
                // which just tears the heartbeat down.
                keepaliveInterval = setInterval(() => {
                    try {
                        writer.write({
                            type: 'data-keepalive',
                            data: { ts: Date.now() },
                            transient: true,
                        });
                    } catch {
                        clearKeepalive();
                    }
                }, STREAM_KEEPALIVE_INTERVAL_MS);

                // Forward step-progress events from tools (`updateProgress`,
                // `editDbtProject`) to the client. `transient: true` so
                // they don't get persisted as part of the message; they're
                // ephemeral status updates the bubble surfaces as the
                // active step under the running tool group until the next
                // event lands or the stream ends. `toolName` lets the client
                // scope the row to the active tool so a concurrently running
                // tool's progress can't surface under another tool's header.
                if (stepProgressEmitter) {
                    stepProgressEmitter.on(
                        'stepProgress',
                        (event: { message: string; toolName?: string }) => {
                            writer.write({
                                type: 'data-step-progress',
                                data: {
                                    message: event.message,
                                    toolName: event.toolName ?? null,
                                },
                                transient: true,
                            });
                        },
                    );
                }

                writer.merge(result.toUIMessageStream());
            },
            onFinish: () => {
                clearKeepalive();
            },
        });

        return {
            pipeUIMessageStreamToResponse: (response) => {
                pipeUIMessageStreamToResponse({
                    response,
                    stream: streamWithMcpNotices,
                });
            },
            consumeStream: result.consumeStream.bind(result),
        };
    }

    // TODO: user permissions
    async updateHumanScoreForSlackPrompt(
        userId: string,
        organizationUuid: string | undefined,
        promptUuid: string,
        humanScore: number,
        humanFeedback?: string,
    ) {
        this.analytics.track<AiAgentPromptFeedbackEvent>({
            event: 'ai_agent_prompt.feedback',
            userId,
            properties: {
                organizationId: organizationUuid ?? '',
                humanScore,
                messageId: promptUuid,
                context: 'slack',
            },
        });
        await this.aiAgentModel.updateHumanScore({
            promptUuid,
            humanScore,
            humanFeedback,
        });

        const promptContext =
            await this.aiAgentModel.findPromptContext(promptUuid);

        this.enqueueReviewClassifierEvent({
            eventType: 'feedback_changed',
            organizationUuid: promptContext?.organizationUuid,
            projectUuid: promptContext?.projectUuid,
            agentUuid: promptContext?.agentUuid,
            threadUuid: promptContext?.threadUuid,
            promptUuid,
            userUuid: userId,
        });
    }

    private async storeThreadContextMessages(
        threadUuid: string,
        threadMessages: Array<
            Required<Pick<MessageElement, 'text' | 'user' | 'ts'>>
        >,
        slackChannelId: string,
        fallbackUserUuid: string,
    ): Promise<void> {
        if (threadMessages.length === 0) return;

        // Get timestamps to check for existing prompts
        const timestamps = threadMessages.map((msg) => msg.ts);
        const existingTimestamps =
            await this.aiAgentModel.existsSlackPromptsByChannelAndTimestamps(
                slackChannelId,
                timestamps,
            );

        // Filter out messages that already exist
        const newMessages = threadMessages.filter(
            (msg) => !existingTimestamps.includes(msg.ts),
        );

        if (newMessages.length === 0) return;

        // Convert Slack timestamp to Date (Slack ts is Unix timestamp with microseconds)
        const convertSlackTsToDate = (ts: string): Date =>
            new Date(parseFloat(ts) * 1000); // Convert to milliseconds

        // Prepare data for bulk insert
        const promptsData = newMessages
            .map((msg) => ({
                createdByUserUuid: fallbackUserUuid, // TODO: use the user uuid from the message
                prompt: msg.text,
                slackUserId: msg.user,
                slackChannelId,
                promptSlackTs: msg.ts,
                createdAt: convertSlackTsToDate(msg.ts),
            }))
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        try {
            await this.aiAgentModel.bulkCreateSlackPrompts(
                threadUuid,
                promptsData,
            );
        } catch (error) {
            Logger.error('Failed to store thread context messages:', error);
            // TODO: handle this error?
        }
    }

    async createSlackPrompt(data: {
        userUuid: string;
        projectUuid: string;
        slackUserId: string;
        slackChannelId: string;
        slackThreadTs: string | undefined;
        prompt: string;
        promptSlackTs: string;
        agentUuid: string | null;
        threadMessages?: Array<
            Required<Pick<MessageElement, 'text' | 'user' | 'ts'>>
        >;
    }): Promise<[string, boolean]> {
        let createdThread = false;
        let threadUuid: string | undefined;

        const slackPromptExists =
            await this.aiAgentModel.existsSlackPromptByChannelIdAndPromptTs(
                data.slackChannelId,
                data.promptSlackTs,
            );

        // This happens in the case of updating a prompt message in slack
        if (slackPromptExists) {
            throw new AiDuplicateSlackPromptError('Prompt already exists');
        }

        if (data.slackThreadTs) {
            threadUuid =
                await this.aiAgentModel.findThreadUuidBySlackChannelIdAndThreadTs(
                    data.slackChannelId,
                    data.slackThreadTs,
                );
        }

        if (!threadUuid) {
            const user = await this.userModel.getUserDetailsByUuid(
                data.userUuid,
            );
            if (user.organizationUuid === undefined) {
                throw new Error('Organization not found');
            }
            createdThread = true;
            threadUuid = await this.aiAgentModel.createSlackThread({
                organizationUuid: user.organizationUuid,
                projectUuid: data.projectUuid,
                createdFrom: 'slack',
                slackUserId: data.slackUserId,
                slackChannelId: data.slackChannelId,
                slackThreadTs: data.slackThreadTs || data.promptSlackTs,
                agentUuid: data.agentUuid,
            });
        }

        if (threadUuid === undefined) {
            throw new Error('Failed to find slack thread');
        }

        // Store thread context messages if provided
        if (data.threadMessages && data.threadMessages.length > 0) {
            await this.storeThreadContextMessages(
                threadUuid,
                data.threadMessages,
                data.slackChannelId,
                data.userUuid,
            );
        }

        const slackTagRegex = /<@U\d+\w*?>/g;

        const uuid = await this.aiAgentModel.createSlackPrompt({
            threadUuid,
            createdByUserUuid: data.userUuid,
            prompt: data.prompt.replaceAll(slackTagRegex, '').trim(),
            slackUserId: data.slackUserId,
            slackChannelId: data.slackChannelId,
            promptSlackTs: data.promptSlackTs,
        });

        const user = await this.userModel.getUserDetailsByUuid(data.userUuid);
        if (user.organizationUuid) {
            this.analytics.track<AiAgentPromptCreatedEvent>({
                event: 'ai_agent_prompt.created',
                userId: data.userUuid,
                properties: {
                    organizationId: user.organizationUuid,
                    projectId: data.projectUuid,
                    aiAgentId: data.agentUuid || '',
                    threadId: threadUuid,
                    context: 'slack',
                    ...AiAgentService.getPinnedContextAnalyticsProperties(
                        undefined,
                    ),
                },
            });
        }

        return [uuid, createdThread];
    }

    // TODO: user permissions
    async replyToSlackPrompt(promptUuid: string): Promise<void> {
        let slackPrompt = await this.aiAgentModel.findSlackPrompt(promptUuid);
        if (slackPrompt === undefined) {
            throw new Error('Prompt not found');
        }

        await this.updateSlackResponseWithProgress(slackPrompt, 'Thinking...');

        const user = await this.userModel.findSessionUserAndOrgByUuid(
            slackPrompt.createdByUserUuid,
            slackPrompt.organizationUuid,
        );

        const auditedAbility = this.createAuditedAbility(user);
        const canManageAgent = auditedAbility.can(
            'manage',
            subject('AiAgent', {
                organizationUuid: slackPrompt.organizationUuid,
                projectUuid: slackPrompt.projectUuid,
                metadata: {
                    promptUuid,
                    threadUuid: slackPrompt.threadUuid,
                },
            }),
        );

        const threadMessages = await this.aiAgentModel.getThreadMessages(
            slackPrompt.organizationUuid,
            slackPrompt.projectUuid,
            slackPrompt.threadUuid,
        );

        const thread = await this.aiAgentModel.findThread(
            slackPrompt.threadUuid,
        );
        if (!thread) {
            throw new Error('Thread not found');
        }

        let agent: AiAgent | undefined;
        if (thread.agentUuid) {
            agent = await this.getAgent(user, thread.agentUuid);
        }

        let response: string | undefined;
        try {
            const chatHistoryMessages =
                await this.getChatHistoryFromThreadMessages(threadMessages, {
                    organizationUuid: slackPrompt.organizationUuid,
                    projectUuid: slackPrompt.projectUuid,
                    agentUuid: agent?.uuid!,
                    retrieveRelevantArtifacts:
                        agent !== undefined &&
                        this.getIsVerifiedArtifactsEnabled(),
                    // TODO: add Slack compaction support once Slack has an
                    // equivalent persisted marker / summary UX.
                    compaction: null,
                });

            response = await this.generateOrStreamAgentResponse(
                user,
                chatHistoryMessages,
                {
                    prompt: slackPrompt,
                    stream: false,
                    canManageAgent,
                    // Slack uses flag-only gating (no per-prompt toggle yet).
                    enableSqlMode: true,
                },
            );
        } catch (e) {
            const userFacingMessage = getUserFacingErrorMessage(
                e,
                'Co-pilot failed to generate a response. Please try again.',
            );
            await this.slackClient.postMessage({
                organizationUuid: slackPrompt.organizationUuid,
                text: `🔴 ${userFacingMessage}`,
                channel: slackPrompt.slackChannelId,
                thread_ts: slackPrompt.slackThreadTs,
                username: agent?.name,
            });

            Logger.error('Failed to generate response:', e);
            throw new Error('Failed to generate response');
        }

        if (!response) {
            return;
        }

        // reload the slack prompt in case it was updated
        slackPrompt = await this.aiAgentModel.findSlackPrompt(promptUuid);

        if (slackPrompt === undefined) {
            throw new Error('Could not reload slack prompt.');
        }

        // Fetch referenced artifacts for this prompt
        const referencedArtifactsMap =
            await this.aiAgentModel.findThreadReferencedArtifacts({
                promptUuids: [slackPrompt.promptUuid],
            });
        const referencedArtifacts =
            referencedArtifactsMap.get(slackPrompt.promptUuid) ?? [];

        await this.slackClient.deleteMessage({
            organizationUuid: slackPrompt.organizationUuid,
            channelId: slackPrompt.slackChannelId,
            messageTs: slackPrompt.response_slack_ts,
        });

        // Get artifacts for the thread to populate Slack blocks
        const threadArtifacts =
            await this.aiAgentModel.findArtifactsByThreadUuid(
                slackPrompt.threadUuid,
            );

        // Get tool results to check for proposeChange results
        const toolResults = await this.aiAgentModel.getToolResultsForPrompt(
            slackPrompt.promptUuid,
        );

        const feedbackBlocks = agent
            ? getFeedbackBlocks(
                  slackPrompt,
                  toolResults,
                  agent.uuid,
                  this.lightdashConfig.siteUrl,
              )
            : [];
        const followUpToolBlocks = getFollowUpToolBlocks(
            slackPrompt,
            threadArtifacts,
        );

        // Generates short share URLs for Slack (so that we can avoid the 3000 char URL limit)
        const createShareUrl = async (
            path: string,
            params: string,
        ): Promise<string> => {
            const result = await this.shareService.createShareUrl(
                user,
                path,
                params,
            );
            return `${this.lightdashConfig.siteUrl}/share/${result.nanoid}`;
        };

        const exploreBlocks = await getArtifactBlocks(
            slackPrompt,
            this.lightdashConfig.siteUrl,
            this.lightdashConfig.ai.copilot.maxQueryLimit,
            createShareUrl,
            (exploreName) =>
                this.getExplore(
                    user,
                    slackPrompt.projectUuid,
                    null,
                    exploreName,
                ),
            threadArtifacts,
        );
        const proposeChangeBlocks = getProposeChangeBlocks(
            slackPrompt,
            this.lightdashConfig.siteUrl,
            toolResults,
        );
        const editDbtProjectBlocks = getEditDbtProjectBlocks(toolResults);
        const historyBlocks = agent
            ? getDeepLinkBlocks(
                  agent.uuid,
                  slackPrompt,
                  this.lightdashConfig.siteUrl,
                  threadArtifacts,
              )
            : undefined;

        const referencedArtifactsBlocks =
            agent && referencedArtifacts.length > 0
                ? getReferencedArtifactsBlocks(
                      agent.uuid,
                      slackPrompt.projectUuid,
                      this.lightdashConfig.siteUrl,
                      referencedArtifacts,
                      slackPrompt.threadUuid,
                      slackPrompt.promptUuid,
                  )
                : [];

        // Slack's `markdown` block renders GitHub-flavoured markdown natively,
        // including tables — which the older mrkdwn-via-section path strips
        // into pipe-text. We pass the agent's raw response straight through
        // for the rich rendering, and keep slackifyMarkdown for the message-
        // level `text` field that drives notifications + older client fallback.
        const slackifiedMarkdown = slackifyMarkdown(response).replace(
            /\\\n/g,
            '\n',
        );

        const blocks = [
            ...getMarkdownBlocks(response),
            ...exploreBlocks,
            ...proposeChangeBlocks,
            ...editDbtProjectBlocks,
            ...referencedArtifactsBlocks,
            ...followUpToolBlocks,
            ...feedbackBlocks,
            ...(historyBlocks || []),
        ];

        let newResponse;
        try {
            newResponse = await this.slackClient.postMessage({
                organizationUuid: slackPrompt.organizationUuid,
                text: slackifiedMarkdown,
                username: agent?.name,
                channel: slackPrompt.slackChannelId,
                thread_ts: slackPrompt.slackThreadTs,
                unfurl_links: false,
                blocks,
            });
        } catch (error) {
            Sentry.captureException(error, {
                tags: {
                    tag: 'replyToSlackPrompt.postMessage',
                },
                extra: { responseLength: slackifiedMarkdown.length },
            });

            const threadUrl = thread.agentUuid
                ? `${this.lightdashConfig.siteUrl}/projects/${slackPrompt.projectUuid}/ai-agents/${thread.agentUuid}/threads/${slackPrompt.threadUuid}`
                : this.lightdashConfig.siteUrl;

            newResponse = await this.slackClient.postMessage({
                organizationUuid: slackPrompt.organizationUuid,
                text: `⚠️ The response couldn't be displayed here. <${threadUrl}|View it in Lightdash>.`,
                username: agent?.name,
                channel: slackPrompt.slackChannelId,
                thread_ts: slackPrompt.slackThreadTs,
                unfurl_links: false,
            });
        }

        await this.aiAgentModel.updateModelResponse({
            promptUuid: slackPrompt.promptUuid,
            response,
        });

        if (newResponse.ts) {
            await this.aiAgentModel.updateSlackResponseTs({
                promptUuid: slackPrompt.promptUuid,
                responseSlackTs: newResponse.ts,
            });
        }

        // Post helpful tip for multi-agent channel after first AI response
        const slackSettings =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                slackPrompt.organizationUuid,
            );

        const isMultiAgentChannel =
            slackSettings?.aiMultiAgentChannelId === slackPrompt.slackChannelId;

        // Only show tip for the first message in the thread
        const isFirstMessage = threadMessages.length === 1;

        if (isMultiAgentChannel && isFirstMessage && agent) {
            // Get bot user ID from Slack client to create proper mention
            const slackApp = this.slackClient.getApp();
            let botMention = 'the app';

            if (slackApp) {
                try {
                    const authTest = await slackApp.client.auth.test({
                        token: slackSettings?.token,
                    });
                    if (authTest.user_id) {
                        botMention = `<@${authTest.user_id}>`;
                    }
                } catch (error) {
                    Logger.error(
                        'Failed to get bot user ID for tip message',
                        error,
                    );
                }
            }

            await this.slackClient.postMessage({
                organizationUuid: slackPrompt.organizationUuid,
                text: `💬 To continue this conversation, just tag ${botMention} in this thread!`,
                channel: slackPrompt.slackChannelId,
                thread_ts: slackPrompt.slackThreadTs,
                blocks: [
                    {
                        type: 'context',
                        elements: [
                            {
                                type: 'mrkdwn',
                                text: `💬 *Tip:* To continue this conversation, just tag ${botMention} in this thread!`,
                            },
                        ],
                    },
                ],
            });
        }
    }

    async getUserAgentPreferences(
        user: SessionUser,
        projectUuid: string,
    ): Promise<AiAgentUserPreferences | null> {
        const { organizationUuid, userUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError(`Organization not found`);
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError(`Copilot not enabled`);
        }

        const project = await this.projectService.getProject(
            projectUuid,
            fromSession(user),
        );
        if (project.organizationUuid !== organizationUuid) {
            throw new ForbiddenError(
                'Project does not belong to this organization',
            );
        }

        return this.aiAgentModel.getUserAgentPreferences({
            userUuid,
            projectUuid,
        });
    }

    async updateUserAgentPreferences(
        user: SessionUser,
        projectUuid: string,
        body: ApiUpdateUserAgentPreferences,
    ): Promise<void> {
        const { organizationUuid, userUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const project = await this.projectService.getProject(
            projectUuid,
            fromSession(user),
        );
        if (project.organizationUuid !== organizationUuid) {
            throw new ForbiddenError(
                'Project does not belong to this organization',
            );
        }

        const agent = await this.getAgent(
            user,
            body.defaultAgentUuid,
            projectUuid,
        );
        if (!agent) {
            throw new NotFoundError('Agent not found');
        }

        await this.aiAgentModel.updateUserAgentPreferences({
            userUuid,
            projectUuid,
            defaultAgentUuid: body.defaultAgentUuid,
        });
    }

    async deleteUserAgentPreferences(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid, userUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const project = await this.projectService.getProject(
            projectUuid,
            fromSession(user),
        );
        if (project.organizationUuid !== organizationUuid) {
            throw new ForbiddenError(
                'Project does not belong to this organization',
            );
        }

        await this.aiAgentModel.deleteUserAgentPreferences({
            userUuid,
            projectUuid,
        });
    }

    private static replaceSlackBlockByBlockId(
        blocks: (Block | KnownBlock)[],
        blockId: string,
        newBlock: Block | KnownBlock,
    ) {
        return blocks.map((block) => {
            if ('block_id' in block && block.block_id === blockId) {
                return newBlock;
            }
            return block;
        });
    }

    // TODO: remove this once we have analytics tracking
    // eslint-disable-next-line class-methods-use-this
    public handleClickExploreButton(app: App) {
        app.action('actions.explore_button_click', async ({ ack, respond }) => {
            await ack();
        });
    }

    // The "View pull request" button is a link button (it just opens the PR
    // URL), but Slack still sends an interaction payload that must be
    // acknowledged within 3s, so ack immediately and then track the click.
    public handleViewPullRequestButton(app: App) {
        app.action(
            /^actions\.view_pull_request_button_click/,
            async ({ ack, body, action, context }) => {
                // Ack first so the click never times out, then track.
                await ack();

                try {
                    if (
                        body.type !== 'block_actions' ||
                        action.type !== 'button'
                    ) {
                        return;
                    }
                    const { teamId } = context;
                    if (!teamId || !body.user?.id) {
                        return;
                    }

                    const organizationUuid =
                        await this.slackAuthenticationModel.getOrganizationUuidFromTeamId(
                            teamId,
                        );

                    // Attribute to the Lightdash user if their Slack identity is
                    // linked; otherwise fall back to the workspace install user.
                    const identity =
                        await this.openIdIdentityModel.findIdentityByOpenId(
                            OpenIdIdentityIssuerType.SLACK,
                            body.user.id,
                        );
                    const userUuid =
                        identity?.userUuid ??
                        (await this.slackAuthenticationModel.getUserUuid(
                            teamId,
                        ));

                    this.analytics.track<AiAgentPullRequestViewedEvent>({
                        event: 'ai_agent.pull_request_viewed',
                        userId: userUuid,
                        properties: {
                            organizationId: organizationUuid,
                            prUrl:
                                'url' in action ? (action.url ?? null) : null,
                        },
                    });
                } catch (e) {
                    Logger.error(
                        'Failed to track pull request viewed event',
                        e,
                    );
                }
            },
        );
    }

    // eslint-disable-next-line class-methods-use-this
    public handleViewArtifact(app: App) {
        app.action('view_artifact', async ({ ack }) => {
            await ack();
            // TODO :: track analytics
        });
    }

    // eslint-disable-next-line class-methods-use-this
    public handleViewChangesetsButtonClick(app: App) {
        app.action('actions.view_changesets_button_click', async ({ ack }) => {
            await ack();
        });
    }

    // Slack approve/reject buttons for runSql tool. Action ID format:
    // actions.sql_approval:<toolCallId>:<threadUuid>:<decision>
    // 'approved_always' marks the thread auto-approved server-side.
    // eslint-disable-next-line class-methods-use-this
    public handleSqlApprovalButton(app: App) {
        app.action(
            /^actions\.sql_approval:/,
            async ({ ack, body, action, respond }) => {
                await ack();
                if (body.type !== 'block_actions' || action.type !== 'button') {
                    return;
                }
                const actionId = 'action_id' in action ? action.action_id : '';
                const parts = actionId.split(':');
                if (parts.length !== 4) {
                    return;
                }
                const toolCallId = parts[1];
                const threadUuid = parts[2];
                const rawDecision = parts[3];

                const isApprovedAlways = rawDecision === 'approved_always';
                const decision: 'approved' | 'rejected' =
                    rawDecision === 'rejected' ? 'rejected' : 'approved';

                if (
                    rawDecision !== 'approved' &&
                    rawDecision !== 'rejected' &&
                    rawDecision !== 'approved_always'
                ) {
                    return;
                }

                if (isApprovedAlways) {
                    markSlackThreadAutoApproved(threadUuid);
                }

                // We don't reverse-map Slack user IDs → Lightdash user UUIDs
                // here (no direct join exists), so the audit trail records
                // the decision without a user reference. The Slack user id
                // is available via body.user.id if we want to enrich later.
                await this.aiAgentModel.recordSqlApproval(
                    toolCallId,
                    decision,
                    null,
                );

                const emoji =
                    decision === 'approved'
                        ? ':white_check_mark:'
                        : ':no_entry_sign:';
                const suffix = isApprovedAlways
                    ? " — won't ask again this thread"
                    : '';
                await respond({
                    text: `SQL ${decision} by <@${body.user.id}>${suffix}`,
                    replace_original: true,
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `${emoji} SQL *${decision}* by <@${body.user.id}>${suffix}`,
                            },
                        },
                    ],
                });
            },
        );
    }

    // eslint-disable-next-line class-methods-use-this
    public handleClickOAuthButton(app: App) {
        // Match action_id pattern: actions.oauth_button_click:teamId:channelId:messageTs
        app.action(
            /^actions\.oauth_button_click:/,
            async ({ ack, body, respond }) => {
                await ack();

                if (body.type === 'block_actions') {
                    const action = body.actions[0];
                    // Parse message info from action_id (format: actions.oauth_button_click:teamId:channelId:messageTs)
                    const actionIdParts = action?.action_id?.split(':');
                    if (actionIdParts?.length === 4) {
                        const [, teamId, channelId, messageTs] = actionIdParts;

                        if (
                            teamId &&
                            channelId &&
                            messageTs &&
                            body.response_url
                        ) {
                            cleanupOAuthCache();
                            const cacheKey = getOAuthCacheKey(
                                teamId,
                                channelId,
                                messageTs,
                            );
                            oauthResponseUrlCache.set(cacheKey, {
                                responseUrl: body.response_url,
                                timestamp: Date.now(),
                            });
                        }
                    }

                    await respond({
                        replace_original: true,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: '🔗 Redirected to Lightdash to complete authentication.',
                                },
                            },
                        ],
                    });
                }
            },
        );
    }

    public handlePromptUpvote(app: App) {
        app.action(
            'prompt_human_score.upvote',
            async ({ ack, body, respond, context, client }) => {
                await ack();
                const { user } = body;
                const { teamId } = context;
                const triggeringMessage =
                    body.type === 'block_actions' ? body.message : undefined;
                const organizationUuid =
                    await this.getSlackVoteOrganizationUuid({
                        teamId,
                        userId: user.id,
                        channelId:
                            body.type === 'block_actions'
                                ? body.channel?.id
                                : undefined,
                        messageId: triggeringMessage?.ts,
                        threadTs: triggeringMessage?.thread_ts,
                        client,
                    });

                if (organizationUuid === null) {
                    return;
                }

                const newBlock = {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `<@${user.id}> upvoted this answer :thumbsup:`,
                        },
                    ],
                };
                if (body.type === 'block_actions') {
                    const action = body.actions[0];
                    if (action && action.type === 'button') {
                        const promptUuid = action.value;
                        if (!promptUuid) {
                            return;
                        }
                        await this.updateHumanScoreForSlackPrompt(
                            user.id,
                            organizationUuid,
                            promptUuid,
                            1,
                        );
                    }
                    const { message } = body;
                    if (message) {
                        const { blocks } = message;

                        await respond({
                            replace_original: true,
                            blocks: AiAgentService.replaceSlackBlockByBlockId(
                                blocks,
                                'prompt_human_score',
                                newBlock,
                            ),
                        });
                    }
                }
            },
        );
    }

    public handlePromptDownvote(app: App) {
        app.action(
            'prompt_human_score.downvote',
            async ({ ack, body, respond, client, context }) => {
                await ack();
                const { user } = body;
                const { teamId } = context;
                const triggeringMessage =
                    body.type === 'block_actions' ? body.message : undefined;
                const organizationUuid =
                    await this.getSlackVoteOrganizationUuid({
                        teamId,
                        userId: user.id,
                        channelId:
                            body.type === 'block_actions'
                                ? body.channel?.id
                                : undefined,
                        messageId: triggeringMessage?.ts,
                        threadTs: triggeringMessage?.thread_ts,
                        client,
                    });

                if (organizationUuid === null) {
                    return;
                }

                const newBlock = {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `<@${user.id}> downvoted this answer :thumbsdown:`,
                        },
                    ],
                };
                if (body.type === 'block_actions') {
                    const action = body.actions[0];
                    if (action && action.type === 'button') {
                        const promptUuid = action.value;
                        if (!promptUuid) {
                            return;
                        }
                        await this.updateHumanScoreForSlackPrompt(
                            user.id,
                            organizationUuid,
                            promptUuid,
                            -1,
                        );

                        const { message } = body;
                        if (message) {
                            const { blocks } = message;

                            await respond({
                                replace_original: true,
                                blocks: AiAgentService.replaceSlackBlockByBlockId(
                                    blocks,
                                    'prompt_human_score',
                                    newBlock,
                                ),
                            });
                        }

                        await client.views.open({
                            trigger_id: body.trigger_id,
                            view: {
                                type: 'modal',
                                callback_id: 'downvote_feedback_modal',
                                private_metadata: JSON.stringify({
                                    promptUuid,
                                }),
                                title: {
                                    type: 'plain_text',
                                    text: 'Feedback',
                                },
                                submit: {
                                    type: 'plain_text',
                                    text: 'Submit',
                                },
                                close: {
                                    type: 'plain_text',
                                    text: 'Skip',
                                },
                                blocks: [
                                    {
                                        type: 'section',
                                        text: {
                                            type: 'mrkdwn',
                                            text: 'Help us improve! What went wrong with this answer?',
                                        },
                                    },
                                    {
                                        type: 'input',
                                        block_id: 'feedback_input',
                                        optional: false,
                                        element: {
                                            type: 'plain_text_input',
                                            action_id: 'feedback_text',
                                            multiline: true,
                                            placeholder: {
                                                type: 'plain_text',
                                                text: 'Your feedback will help improve the AI agent (optional)',
                                            },
                                        },
                                        label: {
                                            type: 'plain_text',
                                            text: 'Feedback',
                                        },
                                    },
                                ],
                            },
                        });
                    }
                }
            },
        );

        // Handle modal submission
        app.view('downvote_feedback_modal', async ({ ack, view, body }) => {
            await ack();

            const metadata = JSON.parse(view.private_metadata);
            const { promptUuid } = metadata;

            const feedbackValue =
                view.state.values.feedback_input?.feedback_text?.value;

            if (feedbackValue) {
                await this.aiAgentModel.updateHumanScore({
                    promptUuid,
                    humanScore: -1,
                    humanFeedback: feedbackValue,
                });

                const promptContext =
                    await this.aiAgentModel.findPromptContext(promptUuid);

                this.enqueueReviewClassifierEvent({
                    eventType: 'feedback_changed',
                    organizationUuid: promptContext?.organizationUuid,
                    projectUuid: promptContext?.projectUuid,
                    agentUuid: promptContext?.agentUuid,
                    threadUuid: promptContext?.threadUuid,
                    promptUuid,
                    userUuid: body.user.id,
                });
            }
        });
    }

    // eslint-disable-next-line class-methods-use-this
    public handleExecuteFollowUpTool(app: App) {
        Object.values(AiResultType).forEach((tool) => {
            app.action(
                `execute_follow_up_tool.${tool}`,
                async ({ ack, body, context, say }) => {
                    await ack();

                    const { type, channel } = body;

                    if (type === 'block_actions') {
                        const action = body.actions[0];

                        if (
                            action.action_id.includes(tool) &&
                            action.type === 'button'
                        ) {
                            const prevSlackPromptUuid = action.value;

                            if (!prevSlackPromptUuid || !say) {
                                return;
                            }
                            const prevSlackPrompt =
                                await this.aiAgentModel.findSlackPrompt(
                                    prevSlackPromptUuid,
                                );
                            if (!prevSlackPrompt) return;

                            const response = await say({
                                thread_ts: prevSlackPrompt.slackThreadTs,
                                text: `${followUpToolsText[tool]}`,
                            });

                            const { teamId } = context;

                            if (
                                !teamId ||
                                !context.botUserId ||
                                !channel ||
                                !response.message?.text ||
                                !response.ts
                            ) {
                                return;
                            }
                            // TODO: Remove this when implementing slack user mapping
                            const userUuid =
                                await this.slackAuthenticationModel.getUserUuid(
                                    teamId,
                                );

                            let slackPromptUuid: string;

                            try {
                                [slackPromptUuid] =
                                    await this.createSlackPrompt({
                                        userUuid,
                                        projectUuid:
                                            prevSlackPrompt.projectUuid,
                                        slackUserId: context.botUserId,
                                        slackChannelId: channel.id,
                                        slackThreadTs:
                                            prevSlackPrompt.slackThreadTs,
                                        prompt: response.message.text,
                                        promptSlackTs: response.ts,
                                        agentUuid: prevSlackPrompt.agentUuid,
                                    });
                            } catch (e) {
                                if (e instanceof AiDuplicateSlackPromptError) {
                                    Logger.debug(
                                        'Failed to create slack prompt:',
                                        e,
                                    );
                                    return;
                                }

                                throw e;
                            }

                            if (response.ts) {
                                await this.aiAgentModel.updateSlackResponseTs({
                                    promptUuid: slackPromptUuid,
                                    responseSlackTs: response.ts,
                                });
                            }

                            await this.schedulerClient.slackAiPrompt({
                                slackPromptUuid,
                                userUuid,
                                projectUuid: prevSlackPrompt.projectUuid,
                                organizationUuid:
                                    prevSlackPrompt.organizationUuid,
                            });
                        }
                    }
                },
            );
        });
    }

    /**
     * Get available agents for a user with their full context, filtered by access if OAuth is required
     */
    public async getAvailableAgents(
        organizationUuid: string,
        userUuid: string,
        slackSettings: { aiRequireOAuth?: boolean },
        filter?: {
            projectType?: ProjectType;
            projectFilter?:
                | { projectUuid: string }
                | { projectUuids: string[] };
        },
    ): Promise<AiAgentWithContext[]> {
        // Validate project UUIDs exist in DB to prevent errors from deleted projects
        let projectFilter = filter?.projectFilter;
        if (projectFilter && 'projectUuids' in projectFilter) {
            const validProjectUuids =
                await this.aiAgentModel.filterExistingProjectUuids(
                    projectFilter.projectUuids,
                );
            projectFilter =
                validProjectUuids.length > 0
                    ? { projectUuids: validProjectUuids }
                    : undefined;
        }

        const allAgents = await this.aiAgentModel.findAllAgents({
            organizationUuid,
            filter: {
                projectType: filter?.projectType,
                projectFilter,
            },
        });

        const user = await this.userModel.findSessionUserAndOrgByUuid(
            userUuid,
            organizationUuid,
        );

        let filteredAgents: AiAgentSummary[];

        if (!slackSettings?.aiRequireOAuth) {
            filteredAgents = allAgents;
        } else {
            filteredAgents = await Promise.all(
                allAgents.map(async (agent) => {
                    const hasAccess = await this.checkAgentAccess(user, agent);
                    return hasAccess ? agent : null;
                }),
            ).then((results) => results.filter((agent) => agent !== null));
        }
        const agentsWithContext = await Promise.all(
            filteredAgents.map(async (agent) => {
                const context = await this.getAgentSummaryContext(user, agent);
                return {
                    ...agent,
                    context,
                };
            }),
        );

        return agentsWithContext;
    }

    /**
     * Show agent selection UI when multiple agents are available
     */
    private async showAgentSelectionUI(
        availableAgents: AiAgent[],
        channelId: string,
        threadTs: string | undefined,
        say: Function,
        shouldSkipForwardingQuery = false,
    ): Promise<void> {
        // Fetch project names for grouping
        const uniqueProjectUuids = [
            ...new Set(availableAgents.map((a) => a.projectUuid)),
        ];
        const projectMap = new Map<string, string>();
        await Promise.all(
            uniqueProjectUuids.map(async (projectUuid) => {
                try {
                    const project =
                        await this.projectModel.getSummary(projectUuid);
                    projectMap.set(projectUuid, project.name);
                } catch {
                    // If project fetch fails, use UUID as fallback
                    projectMap.set(projectUuid, projectUuid);
                }
            }),
        );

        await say({
            blocks: getAgentSelectionBlocks(
                availableAgents,
                channelId,
                projectMap,
                shouldSkipForwardingQuery,
            ),
            thread_ts: threadTs,
        });
    }

    /**
     * Centralized agent selection logic for Slack multi-agent channels:
     * - 0 agents: shows error message
     * - 1 agent: auto-selects
     * - multiple agents: uses LLM to pick, falls back to UI if low confidence
     *
     * IMPORTANT: This function should ONLY be called for multi-agent channel contexts.
     * Regular channels should use channel-based agent routing instead.
     *
     * @returns The selected agent and a flag indicating whether to skip forwarding the query, or undefined if selection is pending (UI shown) or no agents available
     */
    /**
     * Resolve the built-in system agent to use when no agents are configured.
     * Gated behind the AiSlackSystemAgentFallback feature flag.
     *
     * Returns:
     *  - an `AiAgentWithContext` to use as the fallback agent;
     *  - `'handled'` when it has already replied to the user (e.g. asking which
     *    project to use) and the caller should stop;
     *  - `undefined` when the fallback does not apply (flag off) and the caller
     *    should keep its existing behaviour.
     */
    private async resolveSystemAgentForSlack({
        organizationUuid,
        userUuid,
        projectUuids,
        say,
        slackChannelId,
        threadTs,
        promptText,
    }: {
        organizationUuid: string;
        userUuid: string;
        // Optional restriction (e.g. the multi-agent channel's project filter).
        // When omitted, all of the organization's projects are candidates.
        projectUuids: string[] | null | undefined;
        say: Function;
        slackChannelId: string;
        // Thread anchor (the mention's own ts for a new thread, the root ts for
        // a reply). Used for posting replies and the existing-thread lookup.
        threadTs: string;
        // The user's message, used to route directly to a named project.
        promptText: string;
    }): Promise<AiAgentWithContext | 'handled' | undefined> {
        const user = await this.userModel.findSessionUserAndOrgByUuid(
            userUuid,
            organizationUuid,
        );

        const { enabled } = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.AiSlackSystemAgentFallback,
        });
        if (!enabled) {
            return undefined;
        }

        const resolveAgentForProject = async (projectUuid: string) => {
            const agent = await this.aiAgentModel.getOrCreateSystemAgent({
                organizationUuid,
                projectUuid,
                name: SYSTEM_AGENT_NAME,
                instruction: SYSTEM_AGENT_INSTRUCTION,
            });
            const context = await this.getAgentSummaryContext(user, agent);
            return { ...agent, context };
        };

        // If this Slack thread is already bound to a project, reuse it so
        // follow-up mentions don't re-prompt for a project.
        const existingThreadUuid =
            await this.aiAgentModel.findThreadUuidBySlackChannelIdAndThreadTs(
                slackChannelId,
                threadTs,
            );
        if (existingThreadUuid) {
            const thread =
                await this.aiAgentModel.findThread(existingThreadUuid);
            if (thread?.projectUuid) {
                return resolveAgentForProject(thread.projectUuid);
            }
        }

        // Candidate projects: org projects the user can view, optionally
        // restricted to the channel's configured project filter.
        const orgProjects =
            await this.projectModel.getAllByOrganizationUuid(organizationUuid);
        const allowed =
            projectUuids && projectUuids.length > 0
                ? new Set(projectUuids)
                : null;
        const auditedAbility = this.createAuditedAbility(user);
        const candidateProjects = orgProjects.filter(
            (project) =>
                (!allowed || allowed.has(project.projectUuid)) &&
                auditedAbility.can(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                ),
        );

        if (candidateProjects.length === 0) {
            await say({
                text: "⚠️ I couldn't find a project you have access to. Ask an admin to set one up or grant you access in Lightdash.",
                thread_ts: threadTs,
            });
            return 'handled';
        }

        if (candidateProjects.length === 1) {
            return resolveAgentForProject(candidateProjects[0].projectUuid);
        }

        // Multiple accessible projects. The system agent must work within one
        // project before it can answer, so if the message clearly names a
        // project, bind to it; otherwise ask the user to pick. The selection
        // sets the project for this thread and all subsequent messages.
        if (promptText.trim().length > 0) {
            try {
                const { model } = getModel(this.lightdashConfig.ai.copilot);
                const routedProjectUuid = await routeProjectForSlack(
                    model,
                    candidateProjects.map((project) => ({
                        projectUuid: project.projectUuid,
                        name: project.name,
                    })),
                    promptText,
                );
                if (routedProjectUuid) {
                    return await resolveAgentForProject(routedProjectUuid);
                }
            } catch (e) {
                // Routing is best-effort; on any failure fall back to the
                // picker so the user is never blocked.
                Logger.error(
                    'Project routing failed, falling back to picker',
                    e,
                );
            }
        }

        // Couldn't determine the project from the message: ask the user to pick
        // one. handleProjectSelection resumes from here, recovering the original
        // question from the Slack thread itself (no server-side state).
        await say({
            blocks: getProjectSelectionBlocks(
                candidateProjects.map((project) => ({
                    projectUuid: project.projectUuid,
                    name: project.name,
                })),
                slackChannelId,
            ),
            text: 'This organization has multiple projects — pick one to continue.',
            thread_ts: threadTs,
        });
        return 'handled';
    }

    private async selectAgentForSlack({
        availableAgents,
        messageText,
        channelId,
        threadTs,
        promptSlackTs,
        say,
        botUserId,
        client,
        isMultiAgentChannel,
        organizationUuid,
        userUuid,
        multiAgentProjectUuids,
    }: {
        availableAgents: AiAgentWithContext[];
        messageText: string;
        channelId: string;
        threadTs: string | undefined;
        promptSlackTs: string;
        say: Function;
        botUserId: string | undefined;
        client: WebClient;
        isMultiAgentChannel: boolean;
        organizationUuid: string;
        userUuid: string;
        multiAgentProjectUuids: string[] | null | undefined;
    }): Promise<
        | { agent: AiAgentWithContext; shouldSkipForwardingQuery: boolean }
        | undefined
    > {
        // Guard: This function is only meant for multi-agent channel contexts
        if (!isMultiAgentChannel) {
            Logger.warn(
                'selectAgentForSlack called outside of multi-agent channel context - this is likely a bug',
            );
            return undefined;
        }

        const noAgentsMessage =
            '⚠️ No AI agents are available. Please contact your administrator to configure agents.';

        if (availableAgents.length === 0) {
            // No configured agents — fall back to the built-in system agent
            // (gated behind AiSlackSystemAgentFallback). If the flag is off,
            // keep the original "no agents" message.
            const fallback = await this.resolveSystemAgentForSlack({
                organizationUuid,
                userUuid,
                projectUuids: multiAgentProjectUuids,
                say,
                slackChannelId: channelId,
                threadTs: threadTs ?? promptSlackTs,
                promptText: messageText,
            });
            if (fallback === 'handled') {
                return undefined;
            }
            if (fallback) {
                return { agent: fallback, shouldSkipForwardingQuery: false };
            }
            await say({
                text: noAgentsMessage,
                thread_ts: threadTs,
            });
            return undefined;
        }

        if (availableAgents.length === 1) {
            return {
                agent: availableAgents[0],
                shouldSkipForwardingQuery: false,
            };
        }

        const { model } = getModel(this.lightdashConfig.ai.copilot);

        const decision = await selectAgent({
            model,
            candidates: availableAgents,
            prompt: messageText,
        });

        const selectedAgent =
            availableAgents.find(
                (a) => a.uuid === decision.selectedAgentUuid,
            ) ?? availableAgents[0];

        Logger.info(
            `Agent selected by LLM ${JSON.stringify({
                agentUuid: selectedAgent.uuid,
                agentName: selectedAgent.name,
                reasoning: decision.reasoning,
                confidence: decision.confidence,
                shouldSkipForwardingQuery: decision.shouldSkipForwardingQuery,
            })}`,
        );

        if (decision.confidence === 'low') {
            Logger.info(
                `Low confidence in agent selection - showing manual selection UI,
                ${JSON.stringify({
                    reasoning: decision.reasoning,
                    shouldSkipForwardingQuery:
                        decision.shouldSkipForwardingQuery,
                })},`,
            );
            await this.showAgentSelectionUI(
                availableAgents,
                channelId,
                threadTs,
                say,
                decision.shouldSkipForwardingQuery,
            );
            return undefined;
        }

        // Post confirmation message for the selected agent
        const botMentionName = botUserId ? `<@${botUserId}>` : undefined;
        await AiAgentService.postAgentConfirmation(
            client,
            selectedAgent,
            channelId,
            threadTs,
            {
                isMultiAgentChannel: true,
                botMentionName,
            },
        );

        return {
            agent: selectedAgent,
            shouldSkipForwardingQuery: decision.shouldSkipForwardingQuery,
        };
    }

    /**
     * Post agent confirmation message showing which agent the user is chatting with
     */
    private static async postAgentConfirmation(
        client: WebClient,
        agentConfig: AiAgent,
        channelId: string,
        threadTs: string | undefined,
        options: {
            isMultiAgentChannel: boolean;
            botMentionName?: string;
        },
    ): Promise<void> {
        await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            username: agentConfig.name,
            blocks: getAgentConfirmationBlocks(agentConfig, {
                isMultiAgentChannel: options.isMultiAgentChannel,
                botMentionName: options.botMentionName,
            }),
            text: `You're now chatting with ${agentConfig.name}`,
        });
    }

    /**
     * Check if user has access to an agent and throw ForbiddenError if not
     */
    private async verifyAgentAccess(
        agentConfig: AiAgent,
        userUuid: string,
        slackSettings: { aiRequireOAuth?: boolean },
    ): Promise<void> {
        if (!slackSettings?.aiRequireOAuth) {
            return;
        }

        const user = await this.userModel.findSessionUserAndOrgByUuid(
            userUuid,
            agentConfig.organizationUuid,
        );

        const hasAccess = await this.checkAgentAccess(user, agentConfig);
        if (!hasAccess) {
            throw new ForbiddenError();
        }
    }

    /**
     * Handle common error responses for Slack AI agent interactions
     */
    private static async handleSlackAgentError(
        e: unknown,
        say: Function,
        threadTs: string | undefined,
        siteUrl: string,
    ): Promise<boolean> {
        // Returns true if error was handled, false if it should be rethrown
        if (e instanceof AiDuplicateSlackPromptError) {
            Logger.debug('Failed to create slack prompt:', e);
            return true;
        }

        if (e instanceof AiAgentNotFoundError) {
            Logger.debug('Failed to find ai agent:', e);
            await say({
                text: `🤔 It seems like there is no AI agent configured for this channel. Please check if the integration is set up correctly or visit ${siteUrl}/ai-agents to configure one.`,
                thread_ts: threadTs,
            });
            return true;
        }

        if (e instanceof ForbiddenError) {
            await say({
                text: `⚠️ You are not authorized to access this agent. Please contact your administrator to get access.`,
                thread_ts: threadTs,
            });
            return true;
        }

        return false;
    }

    /**
     * Post initial response message and schedule the AI prompt
     */
    private async postInitialResponseAndSchedule(
        agentConfig: AiAgent,
        slackPromptUuid: string,
        userUuid: string,
        userId: string,
        threadTs: string | undefined,
        createdThread: boolean,
        say: Function,
    ): Promise<void> {
        const postedMessage = await say({
            username: agentConfig.name,
            thread_ts: threadTs,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: createdThread
                            ? `Hi <@${userId}>, working on your request now :rocket:`
                            : `Let me check that for you. One moment! :books:`,
                    },
                },
                {
                    type: 'divider',
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'plain_text',
                            text: `It can take up to 15s to get a response.`,
                        },
                        {
                            type: 'plain_text',
                            text: `Reference: ${slackPromptUuid}`,
                        },
                    ],
                },
            ],
        });

        if (postedMessage.ts) {
            await this.aiAgentModel.updateSlackResponseTs({
                promptUuid: slackPromptUuid,
                responseSlackTs: postedMessage.ts,
            });
        }

        await this.schedulerClient.slackAiPrompt({
            slackPromptUuid,
            userUuid,
            projectUuid: agentConfig.projectUuid,
            organizationUuid: agentConfig.organizationUuid,
        });
    }

    public async handleMultiAgentChannelMessage({
        event,
        context,
        say,
        client,
    }: SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs) {
        // Type guard to ensure we only process GenericMessageEvent with required fields
        if (
            event.subtype ||
            !('user' in event) ||
            !('text' in event) ||
            !('channel' in event) ||
            'bot_id' in event ||
            'thread_ts' in event ||
            event.channel_type !== 'channel'
        ) {
            return;
        }

        const { teamId, botUserId } = context;
        if (!teamId) {
            return;
        }

        // Skip if message contains bot mention - let handleAppMention handle it
        if (botUserId && event.text?.includes(`<@${botUserId}>`)) {
            return;
        }

        // Get organization and settings
        const organizationUuid =
            await this.slackAuthenticationModel.getOrganizationUuidFromTeamId(
                teamId,
            );
        const slackSettings =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (!slackSettings) {
            return;
        }

        const isMultiAgentChannel =
            slackSettings.aiMultiAgentChannelId === event.channel;

        // Only respond in the designated multi-agent channel
        if (!isMultiAgentChannel) {
            return;
        }

        Logger.info(`Got message event in multi-agent channel: ${event.text}`);

        // Handle authentication
        const authResult = await this.handleAiAgentAuth(
            slackSettings,
            {
                userId: event.user,
                teamId,
                threadTs: undefined,
                channelId: event.channel,
                messageId: event.ts,
                organizationUuid,
            },
            say,
            client,
        );

        if (!authResult) {
            return;
        }

        const { userUuid } = authResult;

        let slackPromptUuid: string;
        let createdThread: boolean;
        let agentConfig: AiAgent | undefined;

        try {
            // Ensure we have text content
            if (!event.text) {
                Logger.debug('Message has no text content');
                return;
            }

            const availableAgents = await this.getAvailableAgents(
                organizationUuid,
                userUuid,
                slackSettings,
                {
                    projectType: ProjectType.DEFAULT,
                    projectFilter: slackSettings.aiMultiAgentProjectUuids
                        ? {
                              projectUuids:
                                  slackSettings.aiMultiAgentProjectUuids,
                          }
                        : undefined,
                },
            );

            const selectionResult = await this.selectAgentForSlack({
                availableAgents,
                messageText: event.text,
                channelId: event.channel,
                threadTs: event.ts,
                promptSlackTs: event.ts,
                say,
                botUserId: context.botUserId,
                client,
                isMultiAgentChannel,
                organizationUuid,
                userUuid,
                multiAgentProjectUuids: slackSettings.aiMultiAgentProjectUuids,
            });

            if (!selectionResult) {
                // Selection pending (UI shown) or no agents available
                return;
            }

            const { agent, shouldSkipForwardingQuery } = selectionResult;
            agentConfig = agent;

            // If this was a meta-query about agent selection, don't forward it to the agent
            if (shouldSkipForwardingQuery) {
                Logger.info(
                    `Skipping query forwarding for meta-query in multi-agent channel message`,
                );
                return;
            }

            // Verify access for the selected agent
            await this.verifyAgentAccess(agentConfig, userUuid, slackSettings);

            // Create the slack prompt
            [slackPromptUuid, createdThread] = await this.createSlackPrompt({
                userUuid,
                projectUuid: agentConfig.projectUuid,
                slackUserId: event.user,
                slackChannelId: event.channel,
                slackThreadTs: undefined,
                prompt: event.text,
                promptSlackTs: event.ts,
                agentUuid: agentConfig.uuid ?? null,
                threadMessages: undefined,
            });
        } catch (e) {
            const handled = await AiAgentService.handleSlackAgentError(
                e,
                say,
                event.ts,
                this.lightdashConfig.siteUrl,
            );
            if (handled) {
                return;
            }
            throw e;
        }

        await this.postInitialResponseAndSchedule(
            agentConfig!,
            slackPromptUuid,
            userUuid,
            event.user,
            event.ts,
            createdThread,
            say,
        );
    }

    private async getSlackVoteOrganizationUuid({
        teamId,
        userId,
        channelId,
        messageId,
        threadTs,
        client,
    }: {
        teamId?: string;
        userId: string;
        channelId?: string;
        messageId?: string;
        threadTs?: string;
        client: WebClient;
    }): Promise<string | undefined | null> {
        let result:
            | 'no_team_id'
            | 'oauth_not_required'
            | 'authenticated'
            | 'identity_missing' = 'no_team_id';
        let organizationUuid: string | null = null;
        let observedIdentity: OpenIdIdentity | null = null;
        try {
            if (!teamId) {
                return undefined;
            }

            organizationUuid =
                await this.slackAuthenticationModel.getOrganizationUuidFromTeamId(
                    teamId,
                );

            const slackSettings =
                await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                    organizationUuid,
                );

            if (!slackSettings?.aiRequireOAuth) {
                result = 'oauth_not_required';
                return organizationUuid;
            }

            const openIdIdentity =
                await this.openIdIdentityModel.findIdentityByOpenId(
                    OpenIdIdentityIssuerType.SLACK,
                    userId,
                );
            observedIdentity = openIdIdentity;

            if (openIdIdentity) {
                result = 'authenticated';
                return organizationUuid;
            }

            result = 'identity_missing';
            if (channelId) {
                const text = `Hi <@${userId}>! OAuth authentication is required to vote on AI Agent responses. Please connect your Slack account to Lightdash to continue.`;
                const blocks =
                    teamId && messageId
                        ? [
                              {
                                  type: 'section',
                                  text: { type: 'mrkdwn', text },
                              },
                              {
                                  type: 'actions',
                                  elements: [
                                      {
                                          type: 'button',
                                          text: {
                                              type: 'plain_text',
                                              text: 'Connect your Slack account',
                                          },
                                          action_id: `actions.oauth_button_click:${teamId}:${channelId}:${messageId}`,
                                          url: `${
                                              this.lightdashConfig.siteUrl
                                          }/api/v1/auth/slack?team=${teamId}&channel=${channelId}&message=${messageId}&trigger=vote${
                                              threadTs
                                                  ? `&thread_ts=${threadTs}`
                                                  : ''
                                          }`,
                                          style: 'primary',
                                      },
                                  ],
                              },
                          ]
                        : undefined;
                await client.chat.postEphemeral({
                    channel: channelId,
                    user: userId,
                    text,
                    blocks,
                });
            }

            return null;
        } finally {
            Logger.info('AI agent Slack auth check', {
                event: 'ai_agent.slack_auth',
                trigger: 'vote',
                result,
                organizationUuid,
                slackUserId: userId,
                slackUserIdFlavor: userId.startsWith('W')
                    ? 'enterprise'
                    : 'workspace',
                blockActionTeamId: teamId ?? null,
                storedTeamId: observedIdentity?.teamId ?? null,
                hasStoredIdentity: observedIdentity != null,
                teamIdMatchesStored:
                    observedIdentity?.teamId && teamId
                        ? observedIdentity.teamId === teamId
                        : null,
            });
        }
    }

    public handleAgentSelection(app: App) {
        app.action('select_agent', async ({ ack, body, client, context }) => {
            await ack();

            if (body.type !== 'block_actions') {
                return;
            }

            const action = body.actions[0];
            if (action?.type !== 'static_select' || !action.selected_option) {
                return;
            }

            const { teamId } = context;
            if (!teamId || !body.user?.id) {
                return;
            }

            try {
                // Parse the selected agent UUID, channel ID, and shouldSkipForwardingQuery flag from the action value
                const selectedValue = JSON.parse(action.selected_option.value);
                const {
                    agentUuid,
                    channelId,
                    shouldSkipForwardingQuery = false,
                } = selectedValue;

                if (!agentUuid || !channelId) {
                    Logger.error('Invalid agent selection value', {
                        value: action.selected_option.value,
                    });
                    return;
                }

                const organizationUuid =
                    await this.slackAuthenticationModel.getOrganizationUuidFromTeamId(
                        teamId,
                    );

                const slackSettings =
                    await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                        organizationUuid,
                    );

                if (!slackSettings) {
                    throw new NotFoundError(
                        `Slack settings not found for organization ${organizationUuid}`,
                    );
                }

                // Get the thread timestamp (which is the original message timestamp)
                const threadTs =
                    body.message && 'thread_ts' in body.message
                        ? body.message.thread_ts
                        : body.message?.ts;

                // Authenticate user
                const authResult = await this.handleAiAgentAuth(
                    slackSettings,
                    {
                        userId: body.user.id,
                        teamId,
                        threadTs,
                        channelId,
                        messageId: body.message?.ts || '',
                        organizationUuid,
                    },
                    // Pass a no-op function for say since we'll handle responses ourselves
                    async () => {},
                    client,
                );

                if (!authResult) {
                    return;
                }

                const { userUuid } = authResult;

                // Get the selected agent
                const agentConfig = await this.aiAgentModel.getAgent({
                    organizationUuid,
                    agentUuid,
                });

                // Check user access to the agent
                if (slackSettings?.aiRequireOAuth) {
                    const user =
                        await this.userModel.findSessionUserAndOrgByUuid(
                            userUuid,
                            agentConfig.organizationUuid,
                        );

                    const hasAccess = await this.checkAgentAccess(
                        user,
                        agentConfig,
                    );
                    if (!hasAccess) {
                        await client.chat.postEphemeral({
                            channel: channelId,
                            user: body.user.id,
                            thread_ts: threadTs,
                            text: '⚠️ You are not authorized to access this agent. Please contact your administrator to get access.',
                        });
                        return;
                    }
                }

                // Fetch the thread messages to find the original user message
                const conversationHistory = await client.conversations.replies({
                    channel: channelId,
                    ts: threadTs || '',
                    limit: 100,
                });

                // Check if we're in the multi-agent channel
                const isMultiAgentChannel =
                    slackSettings.aiMultiAgentChannelId === channelId;

                // Find the original user message
                // In multi-agent channel: first user message (no @mention needed)
                // In regular channel: first message with @mention
                const originalMessage = conversationHistory.messages?.find(
                    (msg) => {
                        if (msg.user !== body.user.id) return false;
                        if (!msg.text) return false;

                        if (isMultiAgentChannel) {
                            // Multi-agent channel: any user message
                            return true;
                        }
                        // Regular channel: must have @mention
                        return msg.text.includes(`<@${context.botUserId}>`);
                    },
                );

                if (!originalMessage || !originalMessage.text) {
                    Logger.error('Could not find original message in thread', {
                        threadTs,
                        channelId,
                        isMultiAgentChannel,
                    });
                    return;
                }

                // Update the selection message to remove the dropdown
                if (body.message?.ts) {
                    try {
                        await client.chat.update({
                            channel: channelId,
                            ts: body.message.ts,
                            text: `✅ Agent selected: *${agentConfig.name}*`,
                            blocks: [
                                {
                                    type: 'section',
                                    text: {
                                        type: 'mrkdwn',
                                        text: `✅ You selected: *${agentConfig.name}*`,
                                    },
                                },
                            ],
                        });
                    } catch (updateError) {
                        Logger.error(
                            'Failed to update selection message',
                            updateError,
                        );
                    }
                }

                // Post confirmation message with agent details
                const botMentionName = context.botUserId
                    ? `<@${context.botUserId}>`
                    : undefined;

                await AiAgentService.postAgentConfirmation(
                    client,
                    agentConfig,
                    channelId,
                    threadTs,
                    {
                        isMultiAgentChannel,
                        botMentionName,
                    },
                );

                // If this was a meta-query about agent selection, don't forward it to the agent
                if (shouldSkipForwardingQuery) {
                    Logger.info(
                        `Skipping query forwarding for meta-query in agent selection`,
                    );
                    return;
                }

                // Create the prompt with the selected agent
                const [slackPromptUuid] = await this.createSlackPrompt({
                    userUuid,
                    projectUuid: agentConfig.projectUuid,
                    slackUserId: body.user.id,
                    slackChannelId: channelId,
                    slackThreadTs: threadTs,
                    prompt: originalMessage.text,
                    promptSlackTs: originalMessage.ts || '',
                    agentUuid: agentConfig.uuid,
                });

                // Post the initial "working on it" message
                const postedMessage = await client.chat.postMessage({
                    channel: channelId,
                    thread_ts: threadTs,
                    username: agentConfig.name,
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `Hi <@${body.user.id}>, working on your request now :rocket:`,
                            },
                        },
                        {
                            type: 'divider',
                        },
                        {
                            type: 'context',
                            elements: [
                                {
                                    type: 'plain_text',
                                    text: `It can take up to 15s to get a response.`,
                                },
                                {
                                    type: 'plain_text',
                                    text: `Reference: ${slackPromptUuid}`,
                                },
                            ],
                        },
                    ],
                    text: `Working on your request now...`,
                });

                if (postedMessage.ts) {
                    await this.aiAgentModel.updateSlackResponseTs({
                        promptUuid: slackPromptUuid,
                        responseSlackTs: postedMessage.ts,
                    });
                }

                // Schedule the AI prompt processing
                await this.schedulerClient.slackAiPrompt({
                    slackPromptUuid,
                    userUuid,
                    projectUuid: agentConfig.projectUuid,
                    organizationUuid,
                });
            } catch (e) {
                Logger.error('Error handling agent selection', e);
                // Try to notify the user of the error
                if (body.user?.id && 'channel' in body && body.channel?.id) {
                    try {
                        await client.chat.postEphemeral({
                            channel: body.channel.id,
                            user: body.user.id,
                            text: '⚠️ Something went wrong while selecting the agent. Please try again or contact your administrator.',
                        });
                    } catch (notifyError) {
                        Logger.error(
                            'Failed to send error notification',
                            notifyError,
                        );
                    }
                }
            }
        });
    }

    /**
     * Handles the project picker shown by resolveSystemAgentForSlack when an
     * org has multiple projects and no agent is configured for the channel.
     * Resolves the chosen project, binds the system agent to it, and replays the
     * user's stashed question.
     */
    public handleProjectSelection(app: App) {
        // Matches both the dropdown (action_id `select_project`) and the
        // per-project buttons (`select_project:<index>`).
        app.action(
            /^select_project(:|$)/,
            async ({ ack, body, client, context }) => {
                await ack();

                if (body.type !== 'block_actions') {
                    return;
                }

                const action = body.actions[0];
                let rawValue: string | undefined;
                if (action?.type === 'static_select') {
                    rawValue = action.selected_option?.value;
                } else if (action?.type === 'button') {
                    rawValue = action.value;
                }
                if (!rawValue) {
                    return;
                }

                const { teamId } = context;
                if (!teamId || !body.user?.id) {
                    return;
                }

                try {
                    // The action value is user-controlled (it round-trips
                    // through Slack), so validate its shape before trusting
                    // it. `projectName` round-trips so the confirmation
                    // message can name the project without an extra lookup.
                    const projectSelectionSchema = z.object({
                        projectUuid: z.string().uuid(),
                        channelId: z.string().min(1),
                        projectName: z.string().min(1),
                    });
                    const parseResult = projectSelectionSchema.safeParse(
                        JSON.parse(rawValue),
                    );
                    if (!parseResult.success) {
                        Logger.error('Invalid project selection value', {
                            value: rawValue,
                            error: parseResult.error.message,
                        });
                        return;
                    }
                    const { projectUuid, channelId, projectName } =
                        parseResult.data;

                    const organizationUuid =
                        await this.slackAuthenticationModel.getOrganizationUuidFromTeamId(
                            teamId,
                        );

                    const slackSettings =
                        await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                            organizationUuid,
                        );

                    if (!slackSettings) {
                        throw new NotFoundError(
                            `Slack settings not found for organization ${organizationUuid}`,
                        );
                    }

                    const threadTs =
                        body.message && 'thread_ts' in body.message
                            ? body.message.thread_ts
                            : body.message?.ts;

                    // Every downstream step needs the thread anchor (posting
                    // replies, fetching thread history). Without it we can't
                    // continue, so bail rather than calling Slack with an empty
                    // ts.
                    if (!threadTs) {
                        Logger.error(
                            'Project selection action has no thread timestamp',
                        );
                        return;
                    }

                    const authResult = await this.handleAiAgentAuth(
                        slackSettings,
                        {
                            userId: body.user.id,
                            teamId,
                            threadTs,
                            channelId,
                            messageId: body.message?.ts || '',
                            organizationUuid,
                        },
                        async () => {},
                        client,
                    );

                    if (!authResult) {
                        return;
                    }

                    const { userUuid } = authResult;

                    // Re-check the user can still view the chosen project.
                    const user =
                        await this.userModel.findSessionUserAndOrgByUuid(
                            userUuid,
                            organizationUuid,
                        );
                    const auditedAbility = this.createAuditedAbility(user);
                    if (
                        auditedAbility.cannot(
                            'view',
                            subject('Project', {
                                organizationUuid,
                                projectUuid,
                            }),
                        )
                    ) {
                        await client.chat.postEphemeral({
                            channel: channelId,
                            user: body.user.id,
                            thread_ts: threadTs,
                            text: '⚠️ You do not have access to that project.',
                        });
                        return;
                    }

                    // Recover the user's original question from the Slack
                    // thread itself (Slack is the shared source of truth, so
                    // this works across replicas without server-side state).
                    const conversationHistory =
                        await client.conversations.replies({
                            channel: channelId,
                            ts: threadTs,
                            limit: 100,
                        });
                    const originalMessage = conversationHistory.messages?.find(
                        (msg) =>
                            msg.user === body.user.id &&
                            !!msg.text &&
                            msg.text.includes(`<@${context.botUserId}>`),
                    );

                    const agent =
                        await this.aiAgentModel.getOrCreateSystemAgent({
                            organizationUuid,
                            projectUuid,
                            name: SYSTEM_AGENT_NAME,
                            instruction: SYSTEM_AGENT_INSTRUCTION,
                        });

                    // Replace the picker with a confirmation that names the
                    // selected project, so the user has a record of which
                    // project this conversation is bound to.
                    if (body.message?.ts) {
                        try {
                            await client.chat.update({
                                channel: channelId,
                                ts: body.message.ts,
                                text: `✅ Project selected: ${projectName}`,
                                blocks: [
                                    {
                                        type: 'section',
                                        text: {
                                            type: 'mrkdwn',
                                            text: `:white_check_mark: Working in *${projectName}*.`,
                                        },
                                    },
                                ],
                            });
                        } catch (updateError) {
                            Logger.error(
                                'Failed to update project selection message',
                                updateError,
                            );
                        }
                    }

                    // If we can't find the original question in the thread, ask
                    // the user to repeat it rather than guessing.
                    if (!originalMessage?.text || !originalMessage.ts) {
                        await client.chat.postMessage({
                            channel: channelId,
                            thread_ts: threadTs,
                            text: "Got it — ask your question again and I'll work in that project.",
                        });
                        return;
                    }

                    const [slackPromptUuid] = await this.createSlackPrompt({
                        userUuid,
                        projectUuid,
                        slackUserId: body.user.id,
                        slackChannelId: channelId,
                        slackThreadTs: threadTs,
                        prompt: originalMessage.text,
                        promptSlackTs: originalMessage.ts,
                        agentUuid: agent.uuid,
                    });

                    const postedMessage = await client.chat.postMessage({
                        channel: channelId,
                        thread_ts: threadTs,
                        username: agent.name,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `Hi <@${body.user.id}>, working on your request now :rocket:`,
                                },
                            },
                            {
                                type: 'context',
                                elements: [
                                    {
                                        type: 'plain_text',
                                        text: `Reference: ${slackPromptUuid}`,
                                    },
                                ],
                            },
                        ],
                        text: 'Working on your request now...',
                    });

                    if (postedMessage.ts) {
                        await this.aiAgentModel.updateSlackResponseTs({
                            promptUuid: slackPromptUuid,
                            responseSlackTs: postedMessage.ts,
                        });
                    }

                    await this.schedulerClient.slackAiPrompt({
                        slackPromptUuid,
                        userUuid,
                        projectUuid,
                        organizationUuid,
                    });
                } catch (e) {
                    if (e instanceof AiDuplicateSlackPromptError) {
                        Logger.debug(
                            'Duplicate slack prompt on project selection',
                            e,
                        );
                        return;
                    }
                    Logger.error('Error handling project selection', e);
                    if (
                        body.user?.id &&
                        'channel' in body &&
                        body.channel?.id
                    ) {
                        try {
                            await client.chat.postEphemeral({
                                channel: body.channel.id,
                                user: body.user.id,
                                text: '⚠️ Something went wrong while selecting the project. Please try again or contact your administrator.',
                            });
                        } catch (notifyError) {
                            Logger.error(
                                'Failed to send error notification',
                                notifyError,
                            );
                        }
                    }
                }
            },
        );
    }

    private async handleAiAgentAuth(
        slackSettings: { aiRequireOAuth?: boolean },
        {
            userId,
            teamId,
            threadTs,
            channelId,
            messageId,
            organizationUuid,
        }: {
            userId: string;
            teamId: string;
            threadTs: string | undefined;
            channelId: string;
            messageId: string;
            organizationUuid: string;
        },
        say: Function,
        client: WebClient,
    ): Promise<{ userUuid: string } | null> {
        let result:
            | 'oauth_not_required'
            | 'authenticated'
            | 'identity_missing' = 'identity_missing';
        let observedIdentity: OpenIdIdentity | null = null;
        try {
            const aiRequireOAuth = slackSettings?.aiRequireOAuth;
            if (!aiRequireOAuth) {
                result = 'oauth_not_required';
                return {
                    userUuid:
                        await this.slackAuthenticationModel.getUserUuid(teamId),
                };
            }

            const openIdIdentity =
                await this.openIdIdentityModel.findIdentityByOpenId(
                    OpenIdIdentityIssuerType.SLACK,
                    userId,
                );
            observedIdentity = openIdIdentity;

            if (!openIdIdentity) {
                await client.chat.postEphemeral({
                    channel: channelId,
                    user: userId,
                    text: `Hi <@${userId}>! OAuth authentication is required to use AI Agent. Please connect your Slack account to Lightdash to continue.`,
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `Hi <@${userId}>! OAuth authentication is required to use AI Agent. Please connect your Slack account to Lightdash to continue.`,
                            },
                        },
                        {
                            type: 'actions',
                            elements: [
                                {
                                    type: 'button',
                                    text: {
                                        type: 'plain_text',
                                        text: 'Connect your Slack account',
                                    },
                                    // Encode message info in action_id since URL isn't available in action payload
                                    action_id: `actions.oauth_button_click:${teamId}:${channelId}:${messageId}`,
                                    url: `${
                                        this.lightdashConfig.siteUrl
                                    }/api/v1/auth/slack?team=${teamId}&channel=${channelId}&message=${messageId}&trigger=app_mention${
                                        threadTs ? `&thread_ts=${threadTs}` : ''
                                    }`,
                                    style: 'primary',
                                },
                            ],
                        },
                    ],
                });

                return null;
            }

            result = 'authenticated';
            return { userUuid: openIdIdentity.userUuid };
        } finally {
            Logger.info('AI agent Slack auth check', {
                event: 'ai_agent.slack_auth',
                trigger: 'app_mention',
                result,
                organizationUuid,
                slackUserId: userId,
                slackUserIdFlavor: userId.startsWith('W')
                    ? 'enterprise'
                    : 'workspace',
                blockActionTeamId: teamId,
                storedTeamId: observedIdentity?.teamId ?? null,
                hasStoredIdentity: observedIdentity != null,
                teamIdMatchesStored: observedIdentity?.teamId
                    ? observedIdentity.teamId === teamId
                    : null,
            });
        }
    }

    /**
     * Process a pending Slack message after OAuth authentication completes.
     * Called from the OAuth callback to process the original message that triggered auth.
     */
    public async processPendingSlackMessage(data: {
        teamId: string;
        channelId: string;
        messageTs: string;
        threadTs?: string;
        userUuid: string;
        trigger?: 'vote' | 'app_mention';
    }): Promise<void> {
        const {
            teamId,
            channelId,
            messageTs,
            threadTs,
            userUuid,
            trigger = 'app_mention',
        } = data;

        Logger.info(
            `Processing pending Slack message after OAuth: team=${teamId}, channel=${channelId}, message=${messageTs}`,
        );

        // Get organization and settings
        const organizationUuid =
            await this.slackAuthenticationModel.getOrganizationUuidFromTeamId(
                teamId,
            );

        const slackSettings =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (!slackSettings) {
            Logger.error(
                `Slack settings not found for organization ${organizationUuid}`,
            );
            return;
        }

        const client = await this.slackClient.getWebClient(organizationUuid);

        // Get user's Slack ID from openid_identities
        const openIdIdentity =
            await this.openIdIdentityModel.findIdentityByUserUuid(
                userUuid,
                OpenIdIdentityIssuerType.SLACK,
            );

        if (!openIdIdentity) {
            Logger.error(
                `No Slack OpenID identity found for user ${userUuid} after OAuth`,
            );
            return;
        }

        const slackUserId = openIdIdentity.subject;

        // Try to update the ephemeral message via cached response_url
        const cacheKey = getOAuthCacheKey(teamId, channelId, messageTs);
        const cachedResponse = oauthResponseUrlCache.get(cacheKey);

        if (cachedResponse) {
            // Update the ephemeral message to show success, then delete after 10 seconds
            const successText =
                trigger === 'vote'
                    ? '✅ Connected! Click the vote button again to submit your feedback.'
                    : '✅ Authentication successful! Processing your request...';
            try {
                const successResponse = await fetch(
                    cachedResponse.responseUrl,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            replace_original: true,
                            blocks: [
                                {
                                    type: 'section',
                                    text: {
                                        type: 'mrkdwn',
                                        text: successText,
                                    },
                                },
                            ],
                        }),
                    },
                );

                if (successResponse.ok) {
                    // Delete the ephemeral message after 10 seconds
                    setTimeout(async () => {
                        try {
                            await fetch(cachedResponse.responseUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    delete_original: true,
                                }),
                            });
                        } catch (e) {
                            Logger.error(
                                'Failed to delete ephemeral OAuth message:',
                                e,
                            );
                        }
                    }, 10000);
                }

                oauthResponseUrlCache.delete(cacheKey);
            } catch (e) {
                Logger.error(
                    'Failed to update ephemeral message via response_url:',
                    e,
                );
            }
        }

        // Vote-triggered OAuth: the original message is the AI's own reply, not
        // a user prompt. Replaying it would feed the bot its own response.
        // Auth is now established; user re-clicks the vote button to record it.
        if (trigger === 'vote') {
            return;
        }

        // Fetch the original message
        let originalMessageText: string | undefined;
        try {
            const history = await client.conversations.history({
                channel: channelId,
                oldest: messageTs,
                latest: messageTs,
                inclusive: true,
                limit: 1,
            });
            originalMessageText = history.messages?.[0]?.text;
        } catch (e) {
            Logger.error('Failed to fetch original message from Slack:', e);
            return;
        }

        if (!originalMessageText) {
            Logger.error('Original message text not found');
            return;
        }

        // Get agent config
        const isMultiAgentChannel =
            slackSettings.aiMultiAgentChannelId === channelId;

        let agentConfig: AiAgent | undefined;

        if (isMultiAgentChannel) {
            const availableAgents = await this.getAvailableAgents(
                organizationUuid,
                userUuid,
                slackSettings,
                {
                    projectType: ProjectType.DEFAULT,
                    projectFilter: slackSettings.aiMultiAgentProjectUuids
                        ? {
                              projectUuids:
                                  slackSettings.aiMultiAgentProjectUuids,
                          }
                        : undefined,
                },
            );
            // Use first available agent for pending message processing
            [agentConfig] = availableAgents;
        } else {
            agentConfig = await this.aiAgentModel.getAgentBySlackChannelId({
                organizationUuid,
                slackChannelId: channelId,
            });
        }

        if (!agentConfig) {
            Logger.error('No agent found for channel');
            return;
        }

        // Verify access
        try {
            await this.verifyAgentAccess(agentConfig, userUuid, slackSettings);
        } catch (e) {
            Logger.error('User does not have access to agent:', e);
            return;
        }

        // Create prompt
        let slackPromptUuid: string;
        let createdThread: boolean;

        try {
            [slackPromptUuid, createdThread] = await this.createSlackPrompt({
                userUuid,
                projectUuid: agentConfig.projectUuid,
                slackUserId,
                slackChannelId: channelId,
                slackThreadTs: threadTs,
                prompt: originalMessageText,
                promptSlackTs: messageTs,
                agentUuid: agentConfig.uuid ?? null,
            });
        } catch (e) {
            if (e instanceof AiDuplicateSlackPromptError) {
                Logger.debug('Prompt already exists, skipping');
                return;
            }
            throw e;
        }

        // Create say-like wrapper for postInitialResponseAndSchedule
        const say = async (args: AnyType) =>
            client.chat.postMessage({
                channel: channelId,
                ...args,
            });

        await this.postInitialResponseAndSchedule(
            agentConfig,
            slackPromptUuid,
            userUuid,
            slackUserId,
            threadTs || messageTs,
            createdThread,
            say,
        );

        Logger.info(
            `Successfully scheduled AI processing for pending message: ${slackPromptUuid}`,
        );
    }

    // WARNING: Needs - channels:history scope for all slack apps
    public async handleAppMention({
        event,
        context,
        say,
        client,
    }: SlackEventMiddlewareArgs<'app_mention'> & AllMiddlewareArgs) {
        Logger.info(`Got app_mention event ${event.text}`);

        // Best-effort ack reaction — gives the user immediate visual feedback
        // that the bot saw their @mention, before any auth / agent resolution.
        // Fire-and-forget: installs that haven't re-authorized to grant
        // `reactions:write` silently skip the reaction without breaking the
        // mention flow. We use the per-event Slack client here rather than
        // SlackClient.addReaction because we don't yet have the orgUuid at
        // this point (it's resolved a few lines below).
        void client.reactions
            .add({
                channel: event.channel,
                timestamp: event.ts,
                name: 'eyes',
            })
            .catch((err) => {
                Logger.debug('Failed to add :eyes: reaction to mention:', err);
            });

        const { teamId } = context;
        if (!teamId || !event.user) {
            return;
        }
        const organizationUuid =
            await this.slackAuthenticationModel.getOrganizationUuidFromTeamId(
                teamId,
            );
        const slackSettings =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (!slackSettings) {
            throw new NotFoundError(
                `Slack settings not found for organization ${organizationUuid}`,
            );
        }

        const authResult = await this.handleAiAgentAuth(
            slackSettings,
            {
                userId: event.user,
                teamId,
                threadTs: event.thread_ts || event.ts, // Use event.ts for new messages to create a thread
                channelId: event.channel,
                messageId: event.ts,
                organizationUuid,
            },
            say,
            client,
        );

        if (!authResult) {
            return;
        }

        const { userUuid } = authResult;

        let slackPromptUuid: string;
        let createdThread: boolean;
        let threadMessages: ThreadMessageContext | undefined;
        let agentConfig: AiAgent | undefined;

        try {
            // Check if this is the multi-agent channel AND a new thread
            const isMultiAgentChannel =
                slackSettings.aiMultiAgentChannelId === event.channel;
            const isNewThread = !event.thread_ts;

            if (isMultiAgentChannel && isNewThread) {
                // Multi-agent channel: Get available agents and handle selection
                const availableAgents = await this.getAvailableAgents(
                    organizationUuid,
                    userUuid,
                    slackSettings,
                    {
                        projectType: ProjectType.DEFAULT,
                        projectFilter: slackSettings.aiMultiAgentProjectUuids
                            ? {
                                  projectUuids:
                                      slackSettings.aiMultiAgentProjectUuids,
                              }
                            : undefined,
                    },
                );

                const selectionResult = await this.selectAgentForSlack({
                    availableAgents,
                    messageText: event.text ?? '',
                    channelId: event.channel,
                    threadTs: event.ts,
                    promptSlackTs: event.ts,
                    say,
                    botUserId: context.botUserId,
                    client,
                    isMultiAgentChannel,
                    organizationUuid,
                    userUuid,
                    multiAgentProjectUuids:
                        slackSettings.aiMultiAgentProjectUuids,
                });

                if (!selectionResult) {
                    return;
                }

                const { agent, shouldSkipForwardingQuery } = selectionResult;
                agentConfig = agent;

                // If this was a meta-query about agent selection, don't forward it to the agent
                if (shouldSkipForwardingQuery) {
                    Logger.info(
                        `Skipping query forwarding for meta-query in app mention`,
                    );
                    return;
                }
            }

            if (isMultiAgentChannel && !isNewThread && event.thread_ts) {
                // Multi-agent channel, existing thread: Get agent from thread
                const threadUuid =
                    await this.aiAgentModel.findThreadUuidBySlackChannelIdAndThreadTs(
                        event.channel,
                        event.thread_ts,
                    );

                if (threadUuid) {
                    const thread =
                        await this.aiAgentModel.findThread(threadUuid);
                    if (thread?.agentUuid) {
                        agentConfig = await this.aiAgentModel.getAgent({
                            organizationUuid,
                            agentUuid: thread.agentUuid,
                        });
                    }
                }

                if (!agentConfig) {
                    // Thread exists but no agent assigned - user tagged agent mid-thread
                    const availableAgents = await this.getAvailableAgents(
                        organizationUuid,
                        userUuid,
                        slackSettings,
                        {
                            projectType: ProjectType.DEFAULT,
                            projectFilter:
                                slackSettings.aiMultiAgentProjectUuids
                                    ? {
                                          projectUuids:
                                              slackSettings.aiMultiAgentProjectUuids,
                                      }
                                    : undefined,
                        },
                    );

                    const selectionResult = await this.selectAgentForSlack({
                        availableAgents,
                        messageText: event.text ?? '',
                        channelId: event.channel,
                        threadTs: event.thread_ts,
                        promptSlackTs: event.ts,
                        say,
                        botUserId: context.botUserId,
                        client,
                        isMultiAgentChannel,
                        organizationUuid,
                        userUuid,
                        multiAgentProjectUuids:
                            slackSettings.aiMultiAgentProjectUuids,
                    });

                    if (!selectionResult) {
                        return;
                    }

                    const { agent, shouldSkipForwardingQuery } =
                        selectionResult;
                    agentConfig = agent;

                    // If this was a meta-query about agent selection, don't forward it to the agent
                    if (shouldSkipForwardingQuery) {
                        Logger.info(
                            `Skipping query forwarding for meta-query in existing thread`,
                        );
                        return;
                    }
                }
            }

            if (!isMultiAgentChannel) {
                // Regular channel: Use existing agent routing by channel ID
                try {
                    agentConfig =
                        await this.aiAgentModel.getAgentBySlackChannelId({
                            organizationUuid,
                            slackChannelId: event.channel,
                        });
                } catch (e) {
                    // No agent mapped to this channel — fall back to the
                    // built-in system agent (gated behind
                    // AiSlackSystemAgentFallback). If the flag is off, rethrow
                    // so the existing "no agent configured" message is shown.
                    if (!(e instanceof AiAgentNotFoundError)) {
                        throw e;
                    }
                    const fallback = await this.resolveSystemAgentForSlack({
                        organizationUuid,
                        userUuid,
                        projectUuids: undefined,
                        say,
                        slackChannelId: event.channel,
                        threadTs: event.thread_ts ?? event.ts,
                        promptText: event.text ?? '',
                    });
                    if (fallback === 'handled') {
                        return;
                    }
                    if (!fallback) {
                        throw e;
                    }
                    agentConfig = fallback;
                }
            }

            // At this point, we should have a selected agent
            if (!agentConfig) {
                throw new Error('No agent selected - this should not happen');
            }

            // Verify access for the selected agent
            await this.verifyAgentAccess(agentConfig, userUuid, slackSettings);

            if (event.thread_ts) {
                const aiThreadAccessConsent =
                    slackSettings?.aiThreadAccessConsent;

                // Consent is granted - fetch thread messages
                if (aiThreadAccessConsent === true && context.botId) {
                    threadMessages = await AiAgentService.fetchThreadMessages({
                        client,
                        channelId: event.channel,
                        threadTs: event.thread_ts,
                        excludeMessageTs: event.ts,
                        botId: context.botId,
                    });
                }
            }

            [slackPromptUuid, createdThread] = await this.createSlackPrompt({
                userUuid,
                projectUuid: agentConfig.projectUuid,
                slackUserId: event.user,
                slackChannelId: event.channel,
                slackThreadTs: event.thread_ts,
                prompt: event.text,
                promptSlackTs: event.ts,
                agentUuid: agentConfig.uuid ?? null,
                threadMessages,
            });
        } catch (e) {
            const handled = await AiAgentService.handleSlackAgentError(
                e,
                say,
                event.ts,
                this.lightdashConfig.siteUrl,
            );
            if (handled) {
                return;
            }
            throw e;
        }

        await this.postInitialResponseAndSchedule(
            agentConfig!,
            slackPromptUuid,
            userUuid,
            event.user,
            event.ts,
            createdThread,
            say,
        );
    }

    private static processThreadMessages(
        messages: MessageElement[] | undefined,
        excludeMessageTs: string,
        botId: string,
    ): ThreadMessageContext | undefined {
        if (!messages || messages.length === 0) {
            return undefined;
        }

        const threadMessages = messages
            .filter((msg) => {
                // Exclude the current message
                if (msg.ts === excludeMessageTs) {
                    return false;
                }

                // Exclude bot messages and messages from the bot itself
                if (msg.subtype === 'bot_message' || msg.bot_id === botId) {
                    return false;
                }

                return true;
            })
            .map((msg) => ({
                text: msg.text || '[message]',
                user: msg.user || 'unknown',
                ts: msg.ts || '',
            }));

        return threadMessages;
    }

    /**
     * Fetches thread messages from Slack if consent is granted
     */
    private static async fetchThreadMessages({
        client,
        channelId,
        threadTs,
        excludeMessageTs,
        botId,
    }: {
        client: WebClient;
        channelId: string;
        threadTs: string;
        excludeMessageTs: string;
        botId: string;
    }): Promise<ThreadMessageContext | undefined> {
        if (!threadTs) {
            return undefined;
        }

        try {
            const threadHistory = await client.conversations.replies({
                channel: channelId,
                ts: threadTs,
                limit: 100, // TODO: What should be the limit?
            });

            return this.processThreadMessages(
                threadHistory.messages,
                excludeMessageTs,
                botId,
            );
        } catch (error) {
            Logger.error(
                'Failed to fetch thread history, using original message only:',
                error,
            );
        }

        return undefined;
    }

    async cloneThread(
        user: SessionUser,
        agentUuid: string,
        threadUuid: string,
        promptUuid: string,
        { createdFrom }: { createdFrom?: 'web_app' | 'evals' },
    ): Promise<AiAgentThreadSummary> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const sourceThread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });

        if (!sourceThread) {
            throw new NotFoundError(`Source thread not found: ${threadUuid}`);
        }

        // Check if user has access to the source thread
        const hasSourceAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            sourceThread.user.uuid,
        );
        if (!hasSourceAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to access source thread',
            );
        }

        // Clone the thread
        const clonedThreadUuid = await this.aiAgentModel.cloneThread({
            sourceThreadUuid: threadUuid,
            sourcePromptUuid: promptUuid,
            targetUserUuid: user.userUuid,
            createdFrom,
        });

        // Return the cloned thread summary
        const clonedThread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid: clonedThreadUuid,
        });

        if (!clonedThread) {
            throw new Error('Failed to retrieve cloned thread');
        }

        return clonedThread;
    }

    async createThreadShare(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        threadUuid: string,
    ): Promise<ApiAiAgentThreadShareResponse['results']> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });
        if (!agent || agent.projectUuid !== projectUuid) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const sourceThread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });
        if (!sourceThread) {
            throw new NotFoundError(`Source thread not found: ${threadUuid}`);
        }

        const hasSourceAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            sourceThread.user.uuid,
        );
        if (!hasSourceAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to access source thread',
            );
        }

        const share = await this.aiAgentModel.createThreadShare({
            sourceThreadUuid: threadUuid,
            createdByUserUuid: user.userUuid,
            nanoid: nanoidGenerator(),
        });

        const shareUrl = `${this.lightdashConfig.siteUrl}/share/${share.nanoid}`;

        this.analytics.track({
            event: 'ai_agent_thread_share.created',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                aiAgentId: agentUuid,
                threadId: threadUuid,
                aiThreadShareId: share.uuid,
            },
        });

        return {
            ...share,
            createdAt: share.createdAt.toISOString(),
            revokedAt: share.revokedAt?.toISOString() ?? null,
            shareUrl,
        };
    }

    async cloneThreadShare(
        user: SessionUser,
        projectUuid: string,
        aiThreadShareUuid: string,
    ): Promise<AiAgentThreadSummary> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const share = await this.aiAgentModel.getThreadShare(aiThreadShareUuid);
        if (
            !share ||
            share.revokedAt ||
            share.projectUuid !== projectUuid ||
            share.organizationUuid !== organizationUuid
        ) {
            throw new NotFoundError('Shared thread link does not exist');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid: share.agentUuid,
        });
        if (!agent || agent.projectUuid !== projectUuid) {
            throw new NotFoundError(`Agent not found: ${share.agentUuid}`);
        }

        const hasAgentAccess = await this.checkAgentAccess(user, agent);
        if (!hasAgentAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to access agent',
            );
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('AiAgentThread', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to create AI agent thread',
            );
        }

        const clonedThreadUuid = await this.aiAgentModel.cloneThreadShare({
            aiThreadShareUuid,
            projectUuid,
            targetUserUuid: user.userUuid,
        });

        const clonedThread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid: share.agentUuid,
            threadUuid: clonedThreadUuid,
        });

        if (!clonedThread) {
            throw new Error('Failed to retrieve cloned thread');
        }

        this.analytics.track({
            event: 'ai_agent_thread_share.cloned',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                aiAgentId: share.agentUuid,
                threadId: clonedThreadUuid,
                aiThreadShareId: share.uuid,
            },
        });

        return clonedThread;
    }

    // Evaluation methods

    async createEval(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        data: ApiCreateEvaluationRequest,
    ) {
        // Reuse existing access control
        const agent = await this.getAgent(user, agentUuid, projectUuid);

        const evaluation = await this.aiAgentModel.createEval(
            agentUuid,
            {
                title: data.title,
                description: data.description,
                prompts: data.prompts,
            },
            user.userUuid,
        );

        this.analytics.track<AiAgentEvalCreatedEvent>({
            event: 'ai_agent_eval.created',
            userId: user.userUuid,
            properties: {
                organizationId: agent.organizationUuid,
                projectId: agent.projectUuid,
                aiAgentId: agentUuid,
                evalId: evaluation.evalUuid,
                promptsCount: data.prompts.length,
            },
        });

        return evaluation;
    }

    async getEval(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        evalUuid: string,
    ) {
        await this.getAgent(user, agentUuid, projectUuid);

        const evaluation = await this.aiAgentModel.getEval({
            agentUuid,
            evalUuid,
        });

        return evaluation;
    }

    async getEvalsByAgent(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
    ): Promise<AiAgentEvaluationSummary[]> {
        await this.getAgent(user, agentUuid, projectUuid);
        return this.aiAgentModel.getEvalsByAgent(agentUuid);
    }

    async runEval(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        evalUuid: string,
    ): Promise<AiAgentEvaluationRun> {
        const agent = await this.getAgent(user, agentUuid, projectUuid);

        const evaluation = await this.aiAgentModel.getEval({
            agentUuid,
            evalUuid,
        });

        const evalRun = await this.aiAgentModel.createEvalRun(evalUuid);

        // Track eval run analytics
        this.analytics.track<AiAgentEvalRunEvent>({
            event: 'ai_agent_eval.run',
            userId: user.userUuid,
            properties: {
                organizationId: agent.organizationUuid,
                projectId: agent.projectUuid,
                aiAgentId: agentUuid,
                evalId: evalUuid,
                runId: evalRun.runUuid,
                promptsCount: evaluation.prompts.length,
            },
        });

        // Create threads, prompts, and schedule jobs for each eval prompt
        const promises = evaluation.prompts.map(async (evalPrompt) => {
            let thread: AiAgentThreadSummary;

            if (evalPrompt.type === 'thread') {
                thread = await this.cloneThread(
                    user,
                    agentUuid,
                    evalPrompt.threadUuid,
                    evalPrompt.promptUuid,
                    { createdFrom: 'evals' },
                );
            } else if (evalPrompt.type === 'string') {
                thread = await this.createAgentThread(
                    user,
                    agentUuid,
                    {
                        prompt: evalPrompt.prompt,
                    },
                    'evals',
                );
            } else {
                throw new Error(
                    'Evaluation prompt must be either string or thread type',
                );
            }

            const resultUuid = await this.aiAgentModel.createEvalRunResult(
                evalRun.runUuid,
                evalPrompt.evalPromptUuid,
                thread.uuid,
            );

            // Schedule a job for this specific result
            await this.schedulerClient.aiAgentEvalResult({
                evalRunResultUuid: resultUuid,
                evalRunUuid: evalRun.runUuid,
                userUuid: user.userUuid,
                organizationUuid: agent.organizationUuid,
                projectUuid: agent.projectUuid,
                agentUuid,
                threadUuid: thread.uuid,
            });
        });

        await Promise.all(promises);

        return this.aiAgentModel.getEvalRunWithResults(evalRun.runUuid)!;
    }

    async getEvalRuns(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        evalUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ) {
        await this.getAgent(user, agentUuid, projectUuid);

        return this.aiAgentModel.getEvalRuns(evalUuid, paginateArgs);
    }

    async getEvalRunWithResults(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        evalUuid: string,
        runUuid: string,
    ) {
        await this.getAgent(user, agentUuid, projectUuid);

        const evalData = await this.aiAgentModel.getEval({
            agentUuid,
            evalUuid,
        });

        const runData = await this.aiAgentModel.getEvalRunWithResults(runUuid);
        if (!runData || runData.evalUuid !== evalUuid) {
            throw new NotFoundError('Evaluation run not found');
        }

        return runData;
    }

    async updateEval(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        evalUuid: string,
        data: ApiUpdateEvaluationRequest,
    ) {
        // Check access to agent
        await this.getAgent(user, agentUuid, projectUuid);

        await this.aiAgentModel.getEval({
            agentUuid,
            evalUuid,
        });

        return this.aiAgentModel.updateEval(evalUuid, data);
    }

    async appendToEval(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        evalUuid: string,
        data: ApiAppendEvaluationRequest,
    ) {
        // Check access to agent
        const agent = await this.getAgent(user, agentUuid, projectUuid);

        const evaluation = await this.aiAgentModel.getEval({
            agentUuid,
            evalUuid,
        });

        const result = await this.aiAgentModel.appendToEval(evalUuid, data);

        // Track analytics for appending to eval
        this.analytics.track<AiAgentEvalAppendedEvent>({
            event: 'ai_agent_eval.appended',
            userId: user.userUuid,
            properties: {
                organizationId: agent.organizationUuid,
                projectId: agent.projectUuid,
                aiAgentId: agentUuid,
                evalId: evalUuid,
                promptsCount: data.prompts.length,
            },
        });

        return result;
    }

    async deleteEval(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        evalUuid: string,
    ) {
        // Check access to agent
        await this.getAgent(user, agentUuid, projectUuid);

        const evaluation = await this.aiAgentModel.getEval({
            agentUuid,
            evalUuid,
        });

        await this.aiAgentModel.deleteEval(evalUuid);
    }

    async updateEvalRunResult(
        evalRunUuid: string,
        resultUuid: string,
        error: Error | string,
    ) {
        await this.aiAgentModel.updateEvalRunResult(resultUuid, {
            status: 'failed',
            errorMessage:
                error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
        });
        await this.aiAgentModel.checkAndUpdateEvalRunCompletion(evalRunUuid);
    }

    async executeReviewRemediationRun({
        userUuid,
        organizationUuid,
        agentUuid,
        threadUuid,
    }: AiAgentReviewRemediationRunJobPayload): Promise<void> {
        const sessionUser = await this.userModel.findSessionUserAndOrgByUuid(
            userUuid,
            organizationUuid,
        );

        await this.generateAgentThreadResponse(sessionUser, {
            agentUuid,
            threadUuid,
            autoApproveSql: true,
        });
    }

    async executeEvalResult({
        evalRunResultUuid,
        evalRunUuid,
        userUuid,
        organizationUuid,
        agentUuid,
        threadUuid,
    }: AiAgentEvalRunJobPayload): Promise<void> {
        const result =
            await this.aiAgentModel.getEvalRunResult(evalRunResultUuid);

        try {
            await this.aiAgentModel.updateEvalRunResult(result.resultUuid, {
                status: 'running',
            });

            if (!result.threadUuid) {
                throw new NotFoundError(
                    `Thread UUID ${result.threadUuid} not found for evaluation result ${result.resultUuid}`,
                );
            }

            const sessionUser =
                await this.userModel.findSessionUserAndOrgByUuid(
                    userUuid,
                    organizationUuid,
                );

            // Generate the agent response
            await this.generateAgentThreadResponse(sessionUser, {
                agentUuid,
                threadUuid,
                autoApproveSql: true,
            });

            await this.aiAgentModel.updateEvalRunResult(result.resultUuid, {
                status: `assessing`,
            });
            const agent = await this.getAgent(sessionUser, agentUuid);
            const canAccessData = agent.enableDataAccess;
            await this.assessResult(result.resultUuid, canAccessData);

            // Mark as completed with assessment status
            await this.aiAgentModel.updateEvalRunResult(result.resultUuid, {
                status: `completed`,
                completedAt: new Date(),
            });

            // Check if all results for this run are complete
            await this.aiAgentModel.checkAndUpdateEvalRunCompletion(
                evalRunUuid,
            );
        } catch (error) {
            await this.aiAgentModel.updateEvalRunResult(result.resultUuid, {
                status: 'failed',
                errorMessage:
                    error instanceof Error ? error.message : String(error),
                completedAt: new Date(),
            });

            // Check run completion status even on failure
            await this.aiAgentModel.checkAndUpdateEvalRunCompletion(
                evalRunUuid,
            );

            throw error;
        }
    }

    /**
     * Assess the correctness of an evaluation result based on factuality and context relevancy scores.
     * TODO: Consider adding explores information for extra context relevancy assessment
     * @param resultUuid
     * @param canAccessData - Indicates whether the agent can access data (data access is enabled) which means the assessment will be including the data in the context.
     * @returns boolean - Indicates whether the result is correct or not.
     */
    async assessResult(
        resultUuid: string,
        canAccessData: boolean,
    ): Promise<boolean> {
        Logger.info(`Assessing result ${resultUuid}`);
        const { query, response, expectedAnswer, artifact, toolResults } =
            await this.aiAgentModel.getEvalResultDataForAssessment(resultUuid);

        // TODO: Implement judge configuration in the future!
        // reusing existing configuration for now
        const { model: judge, callOptions } = getModel(
            this.lightdashConfig.ai.copilot,
        );

        // Build context from artifacts and tool results
        const contextParts: string[] = [];

        // Add artifact context
        if (artifact) {
            contextParts.push(`Artifact type: ${artifact.artifactType}`);
            if (artifact.chartConfig) {
                contextParts.push(
                    `Chart config: ${JSON.stringify(artifact.chartConfig)}`,
                );
            }
            if (artifact.dashboardConfig) {
                contextParts.push(
                    `Dashboard config: ${JSON.stringify(artifact.dashboardConfig)}`,
                );
            }
        }

        // Add query results context if data access is enabled
        if (canAccessData && toolResults.length > 0) {
            const queryResults = toolResults.filter(
                (toolResult) => toolResult.toolName === 'runQuery',
            );
            if (queryResults.length > 0) {
                contextParts.push('\nQuery Results:');
                queryResults.forEach((toolResult) => {
                    contextParts.push(String(toolResult.result));
                });
            }
        }

        const factualityScore = expectedAnswer
            ? await llmAsAJudge({
                  query,
                  response,
                  expectedAnswer,
                  context: contextParts.length > 0 ? contextParts : undefined,
                  judge,
                  callOptions,
                  scorerType: 'factuality',
              })
            : null;

        const contextRelevancyScore =
            artifact || toolResults.length > 0
                ? await llmAsAJudge({
                      query,
                      response,
                      context: contextParts,
                      judge,
                      callOptions,
                      scorerType: 'contextRelevancy',
                  })
                : null;

        const reasoning = [];
        let passed = true;
        if (factualityScore) {
            reasoning.push(
                ...[
                    `Factuality score passed: ${factualityScore.meta.passed}`,
                    `Factuality rationale: ${factualityScore.result.rationale}`,
                ],
            );
            passed = passed && factualityScore.meta.passed;
        }

        if (contextRelevancyScore) {
            reasoning.push(
                ...[
                    `Context relevancy score passed: ${contextRelevancyScore.meta.passed}`,
                    `Context relevancy reason: ${contextRelevancyScore.result.reason}`,
                ],
            );
            passed = passed && contextRelevancyScore.meta.passed;
        }

        if (reasoning.length === 0) {
            reasoning.push('Not enough information to assess this result');
            passed = false;
        }

        await this.aiAgentModel.createLlmAssessment({
            runResultUuid: resultUuid,
            passed,
            reason: reasoning.join('\n'),
            llmJudgeProvider: judge.provider,
            llmJudgeModel: judge.modelId,
        });

        return passed;
    }

    async getArtifact(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        artifactUuid: string,
        versionUuid?: string,
    ) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const agent = await this.getAgent(user, agentUuid, projectUuid);
        const artifact = await this.aiAgentModel.getArtifact(
            artifactUuid,
            versionUuid,
        );
        const artifactThread = await this.aiAgentModel.findThread(
            artifact.threadUuid,
        );
        if (
            !artifactThread ||
            artifactThread.organizationUuid !== organizationUuid ||
            artifactThread.projectUuid !== agent.projectUuid ||
            artifactThread.agentUuid !== agent.uuid
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to access this artifact',
            );
        }

        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid: agent.uuid,
            threadUuid: artifact.threadUuid,
        });

        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to access this artifact',
            );
        }

        return artifact;
    }

    async appendInstruction(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        instruction: string,
    ): Promise<string> {
        // Check user has access to the agent
        await this.getAgent(user, agentUuid, projectUuid);

        return this.aiAgentModel.appendInstruction({
            agentUuid,
            instruction,
        });
    }

    async getVerifiedArtifacts(
        user: SessionUser,
        projectUuid: string,
        agentUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        // Verify agent exists and user has access
        const agent = await this.getAgent(user, agentUuid, projectUuid);

        // Get verified artifacts from model
        const { pagination, data } =
            await this.aiAgentModel.getVerifiedArtifactsForAgent({
                organizationUuid,
                projectUuid: agent.projectUuid,
                agentUuid,
                paginateArgs,
            });

        // Fetch user details for verified_by users
        const userUuids = [...new Set(data.map((a) => a.verifiedByUserUuid))];
        const users = await Promise.all(
            userUuids.map((uuid) => this.userModel.getUserDetailsByUuid(uuid)),
        );

        const userMap = new Map(users.map((u) => [u.userUuid, u]));

        // Combine data with user info
        const artifactsWithUserInfo = data.map((artifact) => {
            const verifiedByUser = userMap.get(artifact.verifiedByUserUuid);
            return {
                artifactUuid: artifact.artifactUuid,
                versionUuid: artifact.versionUuid,
                artifactType: artifact.artifactType,
                title: artifact.title,
                description: artifact.description,
                verifiedAt: artifact.verifiedAt,
                verifiedBy: {
                    userUuid: artifact.verifiedByUserUuid,
                    firstName: verifiedByUser?.firstName ?? '',
                    lastName: verifiedByUser?.lastName ?? '',
                },
                referenceCount: artifact.referenceCount,
                threadUuid: artifact.threadUuid,
                promptUuid: artifact.promptUuid,
            };
        });

        return {
            pagination,
            data: artifactsWithUserInfo,
        };
    }
}
