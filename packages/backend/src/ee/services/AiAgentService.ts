import { subject } from '@casl/ability';
import {
    AgentSummaryContext,
    AiAgent,
    AiAgentEvalRunJobPayload,
    AiAgentEvaluationRun,
    AiAgentEvaluationSummary,
    AiAgentNotFoundError,
    AiAgentSummary,
    AiAgentThread,
    AiAgentThreadSummary,
    AiAgentUserPreferences,
    AiAgentWithContext,
    AiDuplicateSlackPromptError,
    AiMetricQueryWithFilters,
    AiModelOption,
    AiResultType,
    AiVizMetadata,
    AiWebAppPrompt,
    AnyType,
    ApiAiAgentThreadCreateRequest,
    ApiAiAgentThreadMessageCreateRequest,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageVizQuery,
    ApiAppendEvaluationRequest,
    ApiCreateAiAgent,
    ApiCreateEvaluationRequest,
    ApiUpdateAiAgent,
    ApiUpdateEvaluationRequest,
    ApiUpdateUserAgentPreferences,
    CatalogType,
    CommercialFeatureFlags,
    Explore,
    ExploreCompiler,
    filterExploreByTags,
    followUpToolsText,
    ForbiddenError,
    isExploreError,
    isSlackPrompt,
    KnexPaginateArgs,
    LightdashUser,
    NotFoundError,
    NotImplementedError,
    OpenIdIdentityIssuerType,
    ParameterError,
    parseVizConfig,
    ProjectType,
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
    type SessionUser,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import { AllMiddlewareArgs, App, SlackEventMiddlewareArgs } from '@slack/bolt';
import { Block, KnownBlock, WebClient } from '@slack/web-api';
import { MessageElement } from '@slack/web-api/dist/response/ConversationsHistoryResponse';
import {
    AssistantModelMessage,
    ModelMessage,
    ToolCallPart,
    ToolModelMessage,
    UserModelMessage,
} from 'ai';
import _ from 'lodash';
import slackifyMarkdown from 'slackify-markdown';
import {
    AiAgentArtifactsRetrievedEvent,
    AiAgentArtifactVersionVerifiedEvent,
    AiAgentCreatedEvent,
    AiAgentDeletedEvent,
    AiAgentEvalAppendedEvent,
    AiAgentEvalCreatedEvent,
    AiAgentEvalRunEvent,
    AiAgentPromptCreatedEvent,
    AiAgentPromptFeedbackEvent,
    AiAgentResponseStreamed,
    AiAgentToolCallEvent,
    AiAgentUpdatedEvent,
    LightdashAnalytics,
} from '../../analytics/LightdashAnalytics';
import { fromSession } from '../../auth/account';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import {
    CatalogModel,
    CatalogSearchContext,
} from '../../models/CatalogModel/CatalogModel';
import { ChangesetModel } from '../../models/ChangesetModel';
import { GroupsModel } from '../../models/GroupsModel';
import { OpenIdIdentityModel } from '../../models/OpenIdIdentitiesModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../models/SearchModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserModel } from '../../models/UserModel';
import PrometheusMetrics from '../../prometheus';
import { AsyncQueryService } from '../../services/AsyncQueryService/AsyncQueryService';
import { CatalogService } from '../../services/CatalogService/CatalogService';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../services/ProjectService/ProjectService';
import { ShareService } from '../../services/ShareService/ShareService';
import { SpaceService } from '../../services/SpaceService/SpaceService';
import {
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
} from '../../services/UserAttributesService/UserAttributeUtils';
import { wrapSentryTransaction } from '../../utils';
import { AiAgentModel } from '../models/AiAgentModel';
import { CommercialSlackAuthenticationModel } from '../models/CommercialSlackAuthenticationModel';
import { CommercialSchedulerClient } from '../scheduler/SchedulerClient';
import { selectBestAgentWithContext } from './ai/agents/agentSelector';
import {
    generateAgentResponse,
    streamAgentResponse,
} from './ai/agents/agentV2';
import { generateEmbedding } from './ai/agents/embeddingGenerator';
import { generateArtifactQuestion } from './ai/agents/questionGenerator';
import { evaluateAgentReadiness } from './ai/agents/readinessScorer';
import { generateThreadTitle as generateTitleFromMessages } from './ai/agents/titleGenerator';
import { getAvailableModels, getDefaultModel, getModel } from './ai/models';
import { matchesPreset } from './ai/models/presets';
import { AiAgentArgs, AiAgentDependencies } from './ai/types/aiAgent';
import {
    CreateChangeFn,
    FindContentFn,
    FindExploresFn,
    FindFieldFn,
    GetPromptFn,
    ListExploresFn,
    RunMiniMetricQueryFn,
    SearchFieldValuesFn,
    SendFileFn,
    StoreReasoningFn,
    StoreToolCallFn,
    StoreToolResultsFn,
    UpdateProgressFn,
} from './ai/types/aiAgentDependencies';
import {
    getAgentConfirmationBlocks,
    getAgentSelectionBlocks,
    getArtifactBlocks,
    getDeepLinkBlocks,
    getFeedbackBlocks,
    getFollowUpToolBlocks,
    getProposeChangeBlocks,
    getReferencedArtifactsBlocks,
} from './ai/utils/getSlackBlocks';
import { llmAsAJudge } from './ai/utils/llmAsAJudge';
import { populateCustomMetricsSQL } from './ai/utils/populateCustomMetricsSQL';
import { validateSelectedFieldsExistence } from './ai/utils/validators';
import { AiOrganizationSettingsService } from './AiOrganizationSettingsService';

type ThreadMessageContext = Array<
    Required<Pick<MessageElement, 'text' | 'user' | 'ts'>>
>;

type AiAgentServiceDependencies = {
    aiAgentModel: AiAgentModel;
    analytics: LightdashAnalytics;
    asyncQueryService: AsyncQueryService;
    catalogService: CatalogService;
    catalogModel: CatalogModel;
    changesetModel: ChangesetModel;
    searchModel: SearchModel;
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
    projectModel: ProjectModel;
    aiOrganizationSettingsService: AiOrganizationSettingsService;
    shareService: ShareService;
    prometheusMetrics?: PrometheusMetrics;
};

export class AiAgentService {
    private readonly aiAgentModel: AiAgentModel;

    private readonly analytics: LightdashAnalytics;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly catalogService: CatalogService;

    private readonly catalogModel: CatalogModel;

    private readonly changesetModel: ChangesetModel;

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

    private readonly userModel: UserModel;

    private readonly spaceService: SpaceService;

    private readonly projectModel: ProjectModel;

    private readonly prometheusMetrics?: PrometheusMetrics;

    private readonly aiOrganizationSettingsService: AiOrganizationSettingsService;

    private readonly shareService: ShareService;

    constructor(dependencies: AiAgentServiceDependencies) {
        this.aiAgentModel = dependencies.aiAgentModel;
        this.analytics = dependencies.analytics;
        this.asyncQueryService = dependencies.asyncQueryService;
        this.catalogService = dependencies.catalogService;
        this.catalogModel = dependencies.catalogModel;
        this.changesetModel = dependencies.changesetModel;
        this.searchModel = dependencies.searchModel;
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
        this.projectModel = dependencies.projectModel;
        this.prometheusMetrics = dependencies.prometheusMetrics;
        this.aiOrganizationSettingsService =
            dependencies.aiOrganizationSettingsService;
        this.shareService = dependencies.shareService;
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
        if (
            user.ability.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid: agent.organizationUuid,
                    projectUuid: agent.projectUuid,
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
            return true;
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

        if (
            user.ability.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid: agent.organizationUuid,
                    projectUuid: agent.projectUuid,
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
    ) {
        return wrapSentryTransaction(
            'AiAgent.getAvailableExplores',
            {
                projectUuid,
                availableTags,
            },
            async () => {
                const { organizationUuid } = user;
                if (!organizationUuid) {
                    throw new ForbiddenError('Organization not found');
                }

                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        { organizationUuid, userUuid: user.userUuid },
                    );

                const allExplores = Object.values(
                    await this.projectModel.findExploresFromCache(
                        projectUuid,
                        'name',
                    ),
                );

                return allExplores
                    .filter(
                        (explore): explore is Explore =>
                            !isExploreError(explore),
                    )
                    .filter((explore) =>
                        doesExploreMatchRequiredAttributes(
                            explore.tables[explore.baseTable]
                                .requiredAttributes,
                            userAttributes,
                        ),
                    )
                    .map((explore) =>
                        getFilteredExplore(explore, userAttributes),
                    )
                    .filter((explore) =>
                        filterExploreByTags({ explore, availableTags }),
                    )
                    .filter((explore): explore is Explore => !!explore);
            },
        );
    }

    private async getExplore(
        user: SessionUser,
        projectUuid: string,
        availableTags: string[] | null,
        exploreName: string,
    ) {
        const explores = await this.getAvailableExplores(
            user,
            projectUuid,
            availableTags,
        );

        const explore = explores.find((e) => e.name === exploreName);

        if (!explore) {
            throw new NotFoundError('Explore not found');
        }

        return explore;
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

    private async executeAsyncAiMetricQuery(
        user: SessionUser,
        projectUuid: string,
        metricQuery: AiMetricQueryWithFilters,
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

        const asyncQuery = await this.asyncQueryService.executeAsyncMetricQuery(
            {
                account: fromSession(user),
                projectUuid,
                metricQuery: {
                    ...metricQuery,
                    additionalMetrics: populateCustomMetricsSQL(
                        metricQuery.additionalMetrics,
                        explore,
                    ),
                },
                context: QueryExecutionContext.AI,
            },
        );

        return asyncQuery;
    }

    public async getAgent(
        user: SessionUser,
        agentUuid: string,
        projectUuid?: string,
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
            filter: {
                projectUuid,
            },
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
        const canViewAllThreads =
            allUsers &&
            user.ability.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
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

        if (thread.createdFrom !== 'slack') {
            return {
                ...thread,
                messages,
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

        const messageUuid = await this.aiAgentModel.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: user.userUuid,
            prompt: body.prompt,
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

        if (
            user.ability.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: body.projectUuid,
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
            enableDataAccess: body.enableDataAccess,
            enableSelfImprovement: body.enableSelfImprovement,
            enableReasoning: body.enableReasoning,
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

        if (
            user.ability.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

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
            enableDataAccess: body.enableDataAccess,
            enableSelfImprovement: body.enableSelfImprovement,
            enableReasoning: body.enableReasoning,
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

        if (
            user.ability.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
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

        const chatHistoryMessages = await this.getChatHistoryFromThreadMessages(
            threadMessages,
            {
                organizationUuid: user.organizationUuid,
                projectUuid: agent.projectUuid,
                agentUuid: agent.uuid,
                retrieveRelevantArtifacts:
                    retrieveRelevantArtifacts &&
                    this.getIsVerifiedArtifactsEnabled(),
            },
        );

        return { user, chatHistoryMessages, prompt };
    }

    async streamAgentThreadResponse(
        user: SessionUser,
        {
            agentUuid,
            threadUuid,
        }: {
            agentUuid: string;
            threadUuid: string;
        },
    ): Promise<ReturnType<typeof streamAgentResponse>> {
        try {
            const {
                user: validatedUser,
                chatHistoryMessages,
                prompt,
            } = await this.prepareAgentThreadResponse(user, {
                agentUuid,
                threadUuid,
            });

            const canManageAgent = user.ability.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid: user.organizationUuid,
                    projectUuid: prompt.projectUuid,
                }),
            );

            const response = await this.generateOrStreamAgentResponse(
                validatedUser,
                chatHistoryMessages,
                {
                    prompt,
                    stream: true,
                    canManageAgent,
                },
            );
            return response;
        } catch (e) {
            Logger.error('Failed to generate agent thread response:', e);
            throw new Error('Failed to generate agent thread response');
        }
    }

    async generateAgentThreadResponse(
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
            const {
                user: validatedUser,
                chatHistoryMessages,
                prompt,
            } = await this.prepareAgentThreadResponse(user, {
                agentUuid,
                threadUuid,
            });
            const canManageAgent = user.ability.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid: user.organizationUuid,
                    projectUuid: prompt.projectUuid,
                }),
            );

            const response = await this.generateOrStreamAgentResponse(
                validatedUser,
                chatHistoryMessages,
                {
                    prompt,
                    stream: false,
                    canManageAgent,
                },
            );
            return response;
        } catch (e) {
            console.error(e);
            Logger.error('Failed to generate agent thread response:', e);
            throw new Error('Failed to generate agent thread response', {
                cause: e,
            });
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

            // Get agent settings to use reasoning preference
            const agent = await this.aiAgentModel.getAgent({
                organizationUuid: user.organizationUuid!,
                agentUuid,
            });

            // Get model configuration with agent's reasoning setting
            const { model } = getModel(this.lightdashConfig.ai.copilot, {
                enableReasoning: agent.enableReasoning,
            });

            // Generate title using the dedicated title generator
            const title = await generateTitleFromMessages(
                model,
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
        if (
            user.ability.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
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

    // TODO: user permissions
    async updateHumanScoreForMessage(
        user: SessionUser,
        messageUuid: string,
        humanScore: number,
        humanFeedback?: string | null,
    ) {
        if (humanScore !== 0) {
            this.analytics.track<AiAgentPromptFeedbackEvent>({
                event: 'ai_agent_prompt.feedback',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid,
                    humanScore,
                    messageId: messageUuid,
                    context: 'web_app',
                },
            });
        }

        await this.aiAgentModel.updateHumanScore({
            promptUuid: messageUuid,
            humanScore,
            humanFeedback,
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
        if (
            user.ability.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
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

        const embedding = await this.aiAgentModel.getArtifactEmbedding(
            versionUuid,
        );
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
        const existingQuestion = await this.aiAgentModel.getArtifactQuestion(
            versionUuid,
        );
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

            const { embedding, provider, modelName } = await generateEmbedding(
                text,
                this.lightdashConfig,
                { artifactVersionUuid: payload.artifactVersionUuid },
            );

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

            const { model } = getModel(this.lightdashConfig.ai.copilot, {
                enableReasoning: false,
            });

            const question = await generateArtifactQuestion(
                model,
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
            Sentry.captureException(error);
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
        if (
            user.ability.cannot(
                'view',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
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

        const change = await this.changesetModel.getChange(changeUuid);

        const originalExplores = await this.projectModel.findExploresFromCache(
            agent.projectUuid,
            'name',
            originalChangeset.changes.map((c) => c.entityTableName),
            { applyChangeset: false },
        );

        await this.changesetModel.revertChange(changeUuid);

        await this.catalogModel.indexCatalogReverts({
            projectUuid: agent.projectUuid,
            revertedChanges: [change],
            originalChangeset,
            originalExplores,
        });
        const toolResults = await this.aiAgentModel.getToolResultsForPrompt(
            promptUuid,
        );

        // Find the tool result for the propose_change that created this change
        const proposeChangeResult = toolResults.find(
            (result) =>
                result.toolName === 'proposeChange' &&
                result.metadata.status === 'success' &&
                result.metadata.changeUuid === changeUuid,
        );

        if (
            !proposeChangeResult ||
            !(
                proposeChangeResult.toolName === 'proposeChange' &&
                proposeChangeResult.metadata.status === 'success' &&
                proposeChangeResult.metadata.changeUuid === changeUuid
            )
        ) {
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

        const {
            embedding: queryEmbedding,
            provider,
            modelName,
        } = await generateEmbedding(searchQuery, this.lightdashConfig);

        const verifiedArtifacts =
            await this.aiAgentModel.searchArtifactsBySimilarity({
                organizationUuid,
                projectUuid,
                agentUuid,
                queryEmbedding,
                embeddingModelProvider: provider,
                embeddingModel: modelName,
                limit: 3,
            });

        if (verifiedArtifacts.length > 0) {
            await this.aiAgentModel.recordArtifactReferences({
                promptUuid,
                projectUuid,
                artifactReferences: verifiedArtifacts.map((a) => ({
                    artifactVersionUuid: a.artifactVersionUuid,
                    similarityScore: a.similarity,
                })),
            });

            const averageSimilarity =
                verifiedArtifacts.reduce((sum, a) => sum + a.similarity, 0) /
                verifiedArtifacts.length;

            this.analytics.track<AiAgentArtifactsRetrievedEvent>({
                event: 'ai_agent.artifacts_retrieved',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    agentId: agentUuid,
                    promptId: promptUuid,
                    artifactCount: verifiedArtifacts.length,
                    averageSimilarity,
                },
            });
        }

        return verifiedArtifacts;
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
        },
    ): Promise<ModelMessage[]> {
        const messagesWithToolCalls = await Promise.all(
            threadMessages.map(async (message, index) => {
                const messages: ModelMessage[] = [
                    {
                        role: 'user',
                        content: message.prompt,
                    } satisfies UserModelMessage,
                ];

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
                                        toolResult.toolName ===
                                            'proposeChange' &&
                                        toolResult.metadata.status ===
                                            'success' &&
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

                if (message.response) {
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

        return messagesWithToolCalls.flat();
    }

    // Defines the functions that AI Agent tools can use to interact with the Lightdash backend or slack
    // This is scoped to the project, user and prompt (closure)
    private getAiAgentDependencies(
        user: SessionUser,
        prompt: SlackPrompt | AiWebAppPrompt,
    ) {
        const { projectUuid, organizationUuid } = prompt;

        const listExplores: ListExploresFn = () =>
            wrapSentryTransaction('AiAgent.listExplores', {}, async () => {
                const agentSettings = await this.getAgentSettings(user, prompt);

                return this.getAvailableExplores(
                    user,
                    projectUuid,
                    agentSettings.tags,
                );
            });

        const findExplores: FindExploresFn = (args) =>
            wrapSentryTransaction('AiAgent.findExplores', args, async () => {
                const agentSettings = await this.getAgentSettings(user, prompt);

                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );

                // Get available explores filtered by tags
                const filteredExplores = await this.getAvailableExplores(
                    user,
                    projectUuid,
                    agentSettings.tags,
                );

                const searchResults = await this.catalogService.searchCatalog({
                    projectUuid,
                    userAttributes,
                    catalogSearch: {
                        searchQuery: args.searchQuery,
                        type: CatalogType.Table,
                    },
                    context: CatalogSearchContext.AI_AGENT,
                    paginateArgs: {
                        page: 1,
                        pageSize: 10,
                    },
                    fullTextSearchOperator: 'OR',
                    filteredExplores,
                });

                const exploreSearchResults = searchResults.data
                    .filter((item) => item.type === CatalogType.Table)
                    .map((table) => ({
                        name: table.name,
                        label: table.label,
                        description: table.description,
                        aiHints: table.aiHints ?? undefined,
                        searchRank: table.searchRank,
                        joinedTables: table.joinedTables ?? undefined,
                    }));

                const fieldSearchResults =
                    await this.catalogService.searchCatalog({
                        projectUuid,
                        userAttributes,
                        catalogSearch: {
                            searchQuery: args.searchQuery,
                            type: CatalogType.Field,
                        },
                        context: CatalogSearchContext.AI_AGENT,
                        paginateArgs: {
                            page: 1,
                            pageSize: 50,
                        },
                        fullTextSearchOperator: 'OR',
                        filteredExplores,
                    });

                const topMatchingFields = fieldSearchResults.data
                    .filter((item) => item.type === CatalogType.Field)
                    .map((field) => ({
                        name: field.name,
                        label: field.label,
                        tableName: field.tableName,
                        fieldType: field.fieldType,
                        searchRank: field.searchRank,
                        description: field.description,
                        chartUsage: field.chartUsage ?? 0,
                    }));

                return {
                    exploreSearchResults,
                    topMatchingFields,
                };
            });

        const findFields: FindFieldFn = (args) =>
            wrapSentryTransaction('AiAgent.findFields', args, async () => {
                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );

                const agentSettings = await this.getAgentSettings(user, prompt);

                const explore = await this.getExplore(
                    user,
                    projectUuid,
                    agentSettings.tags,
                    args.table,
                );

                const { data: catalogItems, pagination } =
                    await this.catalogService.searchCatalog({
                        projectUuid,
                        catalogSearch: {
                            type: CatalogType.Field,
                            searchQuery: args.fieldSearchQuery.label,
                        },
                        context: CatalogSearchContext.AI_AGENT,
                        paginateArgs: {
                            page: args.page,
                            pageSize: args.pageSize,
                        },
                        userAttributes,
                        fullTextSearchOperator: 'OR',
                        filteredExplores: [explore],
                    });

                // TODO: we should not filter here, search should be returning a proper type
                const catalogFields = catalogItems.filter(
                    (item) => item.type === CatalogType.Field,
                );

                return { fields: catalogFields, pagination, explore };
            });

        const updateProgress: UpdateProgressFn = (progress) =>
            isSlackPrompt(prompt)
                ? this.updateSlackResponseWithProgress(prompt, progress)
                : Promise.resolve();

        const getPrompt: GetPromptFn = async () => {
            const webOrSlackPrompt = isSlackPrompt(prompt)
                ? await this.aiAgentModel.findSlackPrompt(prompt.promptUuid)
                : await this.aiAgentModel.findWebAppPrompt(prompt.promptUuid);

            if (!webOrSlackPrompt) {
                throw new Error('Prompt not found');
            }
            return webOrSlackPrompt;
        };

        const runMiniMetricQuery: RunMiniMetricQueryFn = (metricQuery) =>
            wrapSentryTransaction(
                'AiAgent.runMiniMetricQuery',
                metricQuery,
                async () => {
                    const agentSettings = await this.getAgentSettings(
                        user,
                        prompt,
                    );
                    const explore = await this.getExplore(
                        user,
                        projectUuid,
                        agentSettings.tags,
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

                    const account = fromSession(user);
                    return this.projectService.runMetricQuery({
                        account,
                        projectUuid,
                        metricQuery: {
                            ...metricQuery,
                            additionalMetrics: populateCustomMetricsSQL(
                                metricQuery.additionalMetrics,
                                explore,
                            ),
                        },
                        exploreName: metricQuery.exploreName,
                        csvLimit: metricQuery.limit,
                        context: QueryExecutionContext.AI,
                        chartUuid: undefined,
                        queryTags: {
                            project_uuid: projectUuid,
                            user_uuid: user.userUuid,
                            organization_uuid: organizationUuid,
                        },
                    });
                },
            );

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

        const findContent: FindContentFn = async (args) =>
            wrapSentryTransaction('AiAgent.findContent', args, async () => {
                const dashboardSearchResults =
                    await this.searchModel.searchDashboards(
                        projectUuid,
                        args.searchQuery.label,
                        undefined,
                        'OR',
                    );

                const chartSearchResults =
                    await this.searchModel.searchAllCharts(
                        projectUuid,
                        args.searchQuery.label,
                        'OR',
                    );

                const allContent = [
                    ...dashboardSearchResults,
                    ...chartSearchResults,
                ];

                const filteredResults =
                    await this.spaceService.filterBySpaceAccess(
                        user,
                        allContent,
                    );

                const agentSettings = await this.getAgentSettings(user, prompt);
                if (
                    !agentSettings.spaceAccess ||
                    agentSettings.spaceAccess.length === 0
                ) {
                    return {
                        content: filteredResults,
                    };
                }

                return {
                    content:
                        agentSettings.spaceAccess.length === 0
                            ? filteredResults
                            : filteredResults.filter(({ spaceUuid }) =>
                                  agentSettings.spaceAccess.includes(spaceUuid),
                              ),
                };
            });

        const searchFieldValues: SearchFieldValuesFn = async (args) =>
            wrapSentryTransaction(
                'AiAgent.searchFieldValues',
                args,
                async () => {
                    const dimensionFilters = args.filters?.dimensions;
                    const andFilters =
                        dimensionFilters && 'and' in dimensionFilters
                            ? dimensionFilters
                            : undefined;

                    const { results } =
                        await this.projectService.searchFieldUniqueValues(
                            user,
                            projectUuid,
                            args.table,
                            args.fieldId,
                            args.query,
                            100,
                            andFilters,
                            false,
                            undefined,
                        );

                    return results;
                },
            );

        const getExploreCompiler = async () => {
            const warehouseCredentials =
                await this.projectModel.getWarehouseCredentialsForProject(
                    projectUuid,
                );

            return new ExploreCompiler(
                warehouseSqlBuilderFromType(
                    warehouseCredentials.type,
                    warehouseCredentials.startOfWeek,
                ),
            );
        };

        const createChange: CreateChangeFn = (params) =>
            wrapSentryTransaction(
                'AiAgent.createChange',
                {
                    type: params.type,
                    entityName: params.entityName,
                    entityType: params.entityType,
                    entityTableName: params.entityTableName,
                },
                async () => {
                    const change = await this.changesetModel.createChange(
                        projectUuid,
                        {
                            createdByUserUuid: user.userUuid,
                            sourcePromptUuid: prompt.promptUuid,
                            ...params,
                        },
                    );

                    await this.catalogService.indexCatalogUpdates(projectUuid, [
                        params.entityTableName,
                    ]);

                    return change.changeUuid;
                },
            );

        return {
            listExplores,
            findContent,
            findFields,
            findExplores,
            updateProgress,
            getPrompt,
            runMiniMetricQuery,
            sendFile,
            storeToolCall,
            storeToolResults,
            storeReasoning,
            searchFieldValues,
            createChange,
            getExploreCompiler,
        };
    }

    async generateOrStreamAgentResponse(
        user: SessionUser,
        messageHistory: ModelMessage[],
        options: {
            prompt: AiWebAppPrompt;
            stream: true;
            canManageAgent: boolean;
        },
    ): Promise<ReturnType<typeof streamAgentResponse>>;
    async generateOrStreamAgentResponse(
        user: SessionUser,
        messageHistory: ModelMessage[],
        options: {
            prompt: AiWebAppPrompt;
            stream: false;
            canManageAgent: boolean;
        },
    ): Promise<string>;
    async generateOrStreamAgentResponse(
        user: SessionUser,
        messageHistory: ModelMessage[],
        options: {
            prompt: SlackPrompt;
            stream: false;
            canManageAgent: boolean;
        },
    ): Promise<string>;
    async generateOrStreamAgentResponse(
        user: SessionUser,

        messageHistory: ModelMessage[],
        options:
            | { canManageAgent: boolean } & (
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
    ): Promise<string | ReturnType<typeof streamAgentResponse>> {
        if (!user.organizationUuid) {
            throw new Error('Organization not found');
        }

        if (!(await this.getIsCopilotEnabled(user))) {
            throw new Error('AI Copilot is not enabled');
        }

        const { prompt, stream } = options;

        const {
            listExplores,
            findContent,
            findFields,
            findExplores,
            updateProgress,
            getPrompt,
            runMiniMetricQuery,
            sendFile,
            storeToolCall,
            storeToolResults,
            storeReasoning,
            searchFieldValues,
            getExploreCompiler,
            createChange,
        } = this.getAiAgentDependencies(user, prompt);

        const agentSettings = await this.getAgentSettings(user, prompt);
        const modelProperties = getModel(this.lightdashConfig.ai.copilot, {
            enableReasoning:
                prompt.modelConfig?.reasoning ?? agentSettings.enableReasoning,
            modelName: prompt.modelConfig?.modelName,
            provider: prompt.modelConfig?.modelProvider as AnyType,
        });

        const args: AiAgentArgs = {
            organizationId: user.organizationUuid,
            userId: user.userUuid,

            ...modelProperties,

            agentSettings,

            messageHistory,
            threadUuid: prompt.threadUuid,
            promptUuid: prompt.promptUuid,

            debugLoggingEnabled:
                this.lightdashConfig.ai.copilot.debugLoggingEnabled,
            telemetryEnabled: this.lightdashConfig.ai.copilot.telemetryEnabled,
            enableDataAccess: agentSettings.enableDataAccess,
            enableSelfImprovement: agentSettings.enableSelfImprovement,

            findExploresFieldSearchSize: 200,
            findFieldsPageSize: 30,
            findDashboardsPageSize: 5,
            findChartsPageSize: 5,
            maxQueryLimit: this.lightdashConfig.ai.copilot.maxQueryLimit,
            siteUrl: this.lightdashConfig.siteUrl,
            canManageAgent: options.canManageAgent,
        };

        const dependencies: AiAgentDependencies = {
            listExplores,
            findContent,
            findFields,
            findExplores,
            runMiniMetricQuery,
            getPrompt,
            sendFile,
            storeToolCall,
            storeToolResults,
            storeReasoning,
            searchFieldValues,
            getExploreCompiler,
            createChange,
            updateProgress: (progress: string) => updateProgress(progress),
            updatePrompt: (
                update: UpdateSlackResponse | UpdateWebAppResponse,
            ) => this.aiAgentModel.updateModelResponse(update),
            trackEvent: (
                event: AiAgentResponseStreamed | AiAgentToolCallEvent,
            ) => this.analytics.track(event),

            createOrUpdateArtifact: async (data) => {
                const artifact = await this.aiAgentModel.createOrUpdateArtifact(
                    data,
                );

                return artifact;
            },

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

        return stream
            ? streamAgentResponse({ args, dependencies })
            : generateAgentResponse({ args, dependencies });
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

        await this.updateSlackResponseWithProgress(
            slackPrompt,
            '🤖 Thinking...',
        );

        const user = await this.userModel.findSessionUserAndOrgByUuid(
            slackPrompt.createdByUserUuid,
            slackPrompt.organizationUuid,
        );

        const canManageAgent = user.ability.can(
            'manage',
            subject('AiAgent', {
                organizationUuid: slackPrompt.organizationUuid,
                projectUuid: slackPrompt.projectUuid,
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
                });

            response = await this.generateOrStreamAgentResponse(
                user,
                chatHistoryMessages,
                {
                    prompt: slackPrompt,
                    stream: false,
                    canManageAgent,
                },
            );
        } catch (e) {
            await this.slackClient.postMessage({
                organizationUuid: slackPrompt.organizationUuid,
                text: `🔴 Co-pilot failed to generate a response 😥 Please try again.`,
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

        const feedbackBlocks = getFeedbackBlocks(slackPrompt, threadArtifacts);
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
            threadArtifacts,
        );
        const proposeChangeBlocks = getProposeChangeBlocks(
            slackPrompt,
            this.lightdashConfig.siteUrl,
            toolResults,
        );
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

        // ! This is needed because the markdownToBlocks escapes all characters and slack just needs &, <, > to be escaped
        // ! https://api.slack.com/reference/surfaces/formatting#escaping
        const slackifiedMarkdown = slackifyMarkdown(response);

        const blocks = [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: slackifiedMarkdown,
                },
            },
            ...exploreBlocks,
            ...proposeChangeBlocks,
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
            throw error;
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

    // eslint-disable-next-line class-methods-use-this
    public handleClickOAuthButton(app: App) {
        app.action(
            'actions.oauth_button_click',
            async ({ ack, body, respond }) => {
                await ack();

                if (body.type === 'block_actions') {
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
            async ({ ack, body, respond, context }) => {
                await ack();
                const { user } = body;
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
                        const { teamId } = context;
                        const organizationUuid = teamId
                            ? await this.slackAuthenticationModel.getOrganizationUuidFromTeamId(
                                  teamId,
                              )
                            : undefined;
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
                        const { teamId } = context;

                        const organizationUuid = teamId
                            ? await this.slackAuthenticationModel.getOrganizationUuidFromTeamId(
                                  teamId,
                              )
                            : undefined;

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
    private async getAvailableAgents(
        organizationUuid: string,
        userUuid: string,
        slackSettings: { aiRequireOAuth?: boolean },
        filter?: { projectType?: ProjectType; projectUuid?: string },
    ): Promise<AiAgentWithContext[]> {
        const allAgents = await this.aiAgentModel.findAllAgents({
            organizationUuid,
            filter,
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
    ): Promise<void> {
        // Fetch project names for grouping
        const uniqueProjectUuids = [
            ...new Set(availableAgents.map((a) => a.projectUuid)),
        ];
        const projectMap = new Map<string, string>();
        await Promise.all(
            uniqueProjectUuids.map(async (projectUuid) => {
                try {
                    const project = await this.projectModel.getSummary(
                        projectUuid,
                    );
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
            ),
            thread_ts: threadTs,
        });
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

        const { teamId } = context;
        if (!teamId) {
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

        // Only respond in the designated multi-agent channel
        if (
            !slackSettings.aiMultiAgentChannelId ||
            slackSettings.aiMultiAgentChannelId !== event.channel
        ) {
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
                },
            );

            if (availableAgents.length === 0) {
                await say({
                    text: '⚠️ No AI agents are available. Please contact your administrator to configure agents.',
                    thread_ts: event.ts,
                });
                return;
            }

            if (availableAgents.length === 1) {
                // Auto-select the only available agent
                [agentConfig] = availableAgents;
            } else {
                // Multiple agents - use LLM to select the best one
                const { model } = getModel(this.lightdashConfig.ai.copilot);

                const { agent: selectedAgent, selection } =
                    await selectBestAgentWithContext(
                        model,
                        availableAgents,
                        event.text,
                    );

                Logger.info(
                    `Agent selected by LLM ${JSON.stringify({
                        agentUuid: selectedAgent.uuid,
                        agentName: selectedAgent.name,
                        reasoning: selection.reasoning,
                        confidence: selection.confidence,
                    })}`,
                );

                // If confidence is low, show selection UI instead
                if (selection.confidence === 'low') {
                    Logger.info(
                        `Low confidence in agent selection - showing manual selection UI,
                        ${JSON.stringify({ reasoning: selection.reasoning })},`,
                    );
                    await this.showAgentSelectionUI(
                        availableAgents,
                        event.channel,
                        event.ts,
                        say,
                    );
                    return;
                }

                const botMentionName = context.botUserId
                    ? `<@${context.botUserId}>`
                    : undefined;

                await AiAgentService.postAgentConfirmation(
                    client,
                    selectedAgent,
                    event.channel,
                    event.ts,
                    {
                        isMultiAgentChannel: true,
                        botMentionName,
                    },
                );

                agentConfig = selectedAgent;
            }

            // At this point, we should have a selected agent
            if (!agentConfig) {
                throw new Error('No agent selected - this should not happen');
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
                // Parse the selected agent UUID and channel ID from the action value
                const selectedValue = JSON.parse(action.selected_option.value);
                const { agentUuid, channelId } = selectedValue;

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
                    limit: 10,
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

    private async handleAiAgentAuth(
        slackSettings: { aiRequireOAuth?: boolean },
        {
            userId,
            teamId,
            threadTs,
            channelId,
            messageId,
        }: {
            userId: string;
            teamId: string;
            threadTs: string | undefined;
            channelId: string;
            messageId: string;
        },
        say: Function,
        client: WebClient,
    ): Promise<{ userUuid: string } | null> {
        const aiRequireOAuth = slackSettings?.aiRequireOAuth;
        if (!aiRequireOAuth) {
            return {
                userUuid: await this.slackAuthenticationModel.getUserUuid(
                    teamId,
                ),
            };
        }

        const openIdIdentity =
            await this.openIdIdentityModel.findIdentityByOpenId(
                OpenIdIdentityIssuerType.SLACK,
                userId,
                teamId,
            );
        if (!openIdIdentity) {
            await client.chat.postEphemeral({
                channel: channelId,
                user: userId,
                // If threadTs is provided, send the message in the thread, otherwise send it to the channel, ephemeral message is easy to miss
                ...(threadTs ? { thread_ts: threadTs } : {}),
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
                                action_id: 'actions.oauth_button_click',
                                url: `${
                                    this.lightdashConfig.siteUrl
                                }/api/v1/auth/slack?team=${teamId}&channel=${channelId}&message=${messageId}${
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

        return { userUuid: openIdIdentity.userUuid };
    }

    // WARNING: Needs - channels:history scope for all slack apps
    public async handleAppMention({
        event,
        context,
        say,
        client,
    }: SlackEventMiddlewareArgs<'app_mention'> & AllMiddlewareArgs) {
        Logger.info(`Got app_mention event ${event.text}`);

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
                threadTs: event.thread_ts,
                channelId: event.channel,
                messageId: event.ts,
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
                );

                if (availableAgents.length === 0) {
                    // No agents available - show error
                    await say({
                        text: '⚠️ No AI agents are available. Please contact your administrator to configure agents.',
                        thread_ts: event.ts,
                    });
                    return;
                }

                if (availableAgents.length === 1) {
                    // Auto-select the only available agent
                    [agentConfig] = availableAgents;
                }

                if (availableAgents.length > 1) {
                    // Multiple agents - show selection UI
                    await this.showAgentSelectionUI(
                        availableAgents,
                        event.channel,
                        event.ts,
                        say,
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
                    const thread = await this.aiAgentModel.findThread(
                        threadUuid,
                    );
                    if (thread?.agentUuid) {
                        agentConfig = await this.aiAgentModel.getAgent({
                            organizationUuid,
                            agentUuid: thread.agentUuid,
                        });
                    }
                }

                if (!agentConfig) {
                    // Thread exists but no agent assigned - this shouldn't happen
                    await say({
                        text: '⚠️ Could not find the agent for this conversation. Please start a new conversation.',
                        thread_ts: event.ts,
                    });
                    return;
                }
            }

            if (!isMultiAgentChannel) {
                // Regular channel: Use existing agent routing by channel ID
                agentConfig = await this.aiAgentModel.getAgentBySlackChannelId({
                    organizationUuid,
                    slackChannelId: event.channel,
                });
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

    async executeEvalResult({
        evalRunResultUuid,
        evalRunUuid,
        userUuid,
        organizationUuid,
        agentUuid,
        threadUuid,
    }: AiAgentEvalRunJobPayload): Promise<void> {
        const result = await this.aiAgentModel.getEvalRunResult(
            evalRunResultUuid,
        );

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
                    `Dashboard config: ${JSON.stringify(
                        artifact.dashboardConfig,
                    )}`,
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
        agentUuid: string,
        artifactUuid: string,
        versionUuid?: string,
    ) {
        // TODO: Add proper permission checking - for now just check user has access to the agent
        await this.getAgent(user, agentUuid);

        return this.aiAgentModel.getArtifact(artifactUuid, versionUuid);
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
