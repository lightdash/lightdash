import { subject } from '@casl/ability';
import {
    Account,
    AiAgent,
    AiAgentNotFoundError,
    AiAgentThread,
    AiAgentThreadSummary,
    AiAgentUserPreferences,
    AiConversation,
    AiConversationMessage,
    AiDuplicateSlackPromptError,
    AiMetricQueryWithFilters,
    AiResultType,
    AiVizMetadata,
    AiWebAppPrompt,
    ApiAiAgentThreadCreateRequest,
    ApiAiAgentThreadMessageCreateRequest,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageViz,
    ApiAiAgentThreadMessageVizQuery,
    ApiCreateAiAgent,
    ApiUpdateAiAgent,
    ApiUpdateUserAgentPreferences,
    assertUnreachable,
    CatalogFilter,
    CatalogType,
    CommercialFeatureFlags,
    filterExploreByTags,
    FollowUpTools,
    followUpToolsText,
    ForbiddenError,
    isSlackPrompt,
    LightdashUser,
    NotFoundError,
    OpenIdIdentityIssuerType,
    parseVizConfig,
    QueryExecutionContext,
    SlackPrompt,
    UpdateSlackResponse,
    UpdateWebAppResponse,
    type SessionUser,
} from '@lightdash/common';
import { AllMiddlewareArgs, App, SlackEventMiddlewareArgs } from '@slack/bolt';
import { Block, KnownBlock, WebClient } from '@slack/web-api';
import { MessageElement } from '@slack/web-api/dist/response/ConversationsHistoryResponse';
import {
    CoreAssistantMessage,
    CoreMessage,
    CoreToolMessage,
    CoreUserMessage,
    ToolCallPart,
    ToolResultPart,
} from 'ai';
import _ from 'lodash';
import slackifyMarkdown from 'slackify-markdown';
import {
    AiAgentCreatedEvent,
    AiAgentDeletedEvent,
    AiAgentPromptCreatedEvent,
    AiAgentPromptFeedbackEvent,
    AiAgentResponseStreamed,
    AiAgentUpdatedEvent,
    LightdashAnalytics,
} from '../../analytics/LightdashAnalytics';
import { fromSession } from '../../auth/account';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { CatalogSearchContext } from '../../models/CatalogModel/CatalogModel';
import { GroupsModel } from '../../models/GroupsModel';
import { OpenIdIdentityModel } from '../../models/OpenIdIdentitiesModel';
import { SearchModel } from '../../models/SearchModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserModel } from '../../models/UserModel';
import { AsyncQueryService } from '../../services/AsyncQueryService/AsyncQueryService';
import { CatalogService } from '../../services/CatalogService/CatalogService';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../services/ProjectService/ProjectService';
import { SpaceService } from '../../services/SpaceService/SpaceService';
import { wrapSentryTransaction } from '../../utils';
import { AiAgentModel } from '../models/AiAgentModel';
import { CommercialSlackAuthenticationModel } from '../models/CommercialSlackAuthenticationModel';
import { CommercialSchedulerClient } from '../scheduler/SchedulerClient';
import { generateAgentResponse, streamAgentResponse } from './ai/agents/agent';
import { getModel } from './ai/models';
import { AiAgentArgs, AiAgentDependencies } from './ai/types/aiAgent';
import {
    FindChartsFn,
    FindDashboardsFn,
    FindExploresFn,
    FindFieldFn,
    GetExploreFn,
    GetPromptFn,
    RunMiniMetricQueryFn,
    SendFileFn,
    StoreToolCallFn,
    StoreToolResultsFn,
    UpdateProgressFn,
} from './ai/types/aiAgentDependencies';
import {
    getDeepLinkBlocks,
    getExploreBlocks,
    getFeedbackBlocks,
    getFollowUpToolBlocks,
} from './ai/utils/getSlackBlocks';
import { validateSelectedFieldsExistence } from './ai/utils/validators';
import { renderTableViz } from './ai/visualizations/vizTable';
import { renderTimeSeriesViz } from './ai/visualizations/vizTimeSeries';
import { renderVerticalBarViz } from './ai/visualizations/vizVerticalBar';

type ThreadMessageContext = Array<
    Required<Pick<MessageElement, 'text' | 'user' | 'ts'>>
>;

type AiAgentServiceDependencies = {
    aiAgentModel: AiAgentModel;
    analytics: LightdashAnalytics;
    asyncQueryService: AsyncQueryService;
    catalogService: CatalogService;
    searchModel: SearchModel;
    spaceModel: SpaceModel;
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
};

export class AiAgentService {
    private readonly aiAgentModel: AiAgentModel;

    private readonly analytics: LightdashAnalytics;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly catalogService: CatalogService;

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

    private readonly spaceModel: SpaceModel;

    private readonly userModel: UserModel;

    private readonly spaceService: SpaceService;

    constructor(dependencies: AiAgentServiceDependencies) {
        this.aiAgentModel = dependencies.aiAgentModel;
        this.analytics = dependencies.analytics;
        this.asyncQueryService = dependencies.asyncQueryService;
        this.catalogService = dependencies.catalogService;
        this.searchModel = dependencies.searchModel;
        this.spaceModel = dependencies.spaceModel;
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

        this.initSlackListeners();
    }

    private initSlackListeners() {
        if (!this.lightdashConfig.ai.copilot.enabled) return;

        const { slackApp } = this.slackClient;
        if (slackApp) {
            slackApp.event('app_mention', (m) => this.handleAppMention(m));
            this.handlePromptUpvote(slackApp);
            this.handlePromptDownvote(slackApp);
            AiAgentService.handleClickExploreButton(slackApp);
            AiAgentService.handleClickOAuthButton(slackApp);
        } else {
            Logger.warn('Slack app not found');
        }
    }

    private async getIsCopilotEnabled(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ) {
        const aiCopilotFlag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });
        return aiCopilotFlag.enabled;
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

    private async getExplore(
        account: Account,
        projectUuid: string,
        availableTags: string[] | null,
        exploreName: string,
    ) {
        const explore = await this.projectService.getExplore(
            account,
            projectUuid,
            exploreName,
        );

        const filteredExplore = filterExploreByTags({
            explore,
            availableTags,
        });

        if (!filteredExplore) {
            throw new NotFoundError('Explore not found');
        }

        return filteredExplore;
    }

    private async runAiMetricQuery(
        user: SessionUser,
        projectUuid: string,
        metricQuery: AiMetricQueryWithFilters,
    ) {
        const account = fromSession(user);
        const explore = await this.getExplore(
            account,
            projectUuid,
            null,
            metricQuery.exploreName,
        );

        const metricQueryFields = [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
        ];

        validateSelectedFieldsExistence(explore, metricQueryFields);

        return this.projectService.runExploreQuery(
            account,
            {
                ...metricQuery,
                // TODO: add tableCalculations
                tableCalculations: [],
            },
            projectUuid,
            metricQuery.exploreName,
            metricQuery.limit,
            undefined,
            QueryExecutionContext.AI,
        );
    }

    private async executeAsyncAiMetricQuery(
        user: SessionUser,
        projectUuid: string,
        metricQuery: AiMetricQueryWithFilters,
    ) {
        const account = fromSession(user);
        const explore = await this.getExplore(
            account,
            projectUuid,
            null,
            metricQuery.exploreName,
        );

        const metricQueryFields = [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
        ];

        validateSelectedFieldsExistence(explore, metricQueryFields);

        const asyncQuery = await this.asyncQueryService.executeAsyncMetricQuery(
            {
                account,
                projectUuid,
                metricQuery: {
                    ...metricQuery,
                    // TODO: add tableCalculations
                    tableCalculations: [],
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
            projectUuid,
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
            createdFrom: 'web_app',
            agentUuid,
        });

        if (body.prompt) {
            await this.aiAgentModel.createWebAppPrompt({
                threadUuid,
                createdByUserUuid: user.userUuid,
                prompt: body.prompt,
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
            projectUuid: body.projectUuid,
            organizationUuid,
            tags: body.tags,
            integrations: body.integrations,
            instruction: body.instruction,
            groupAccess: body.groupAccess,
            userAccess: body.userAccess,
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
            projectUuid: body.projectUuid,
            organizationUuid,
            tags: body.tags,
            integrations: body.integrations,
            instruction: body.instruction,
            imageUrl: body.imageUrl,
            groupAccess: body.groupAccess,
            userAccess: body.userAccess,
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
                'Insufficient permissions to stream response for this agent',
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

        try {
            const chatHistoryMessages =
                await this.getChatHistoryFromThreadMessages(threadMessages);

            const response = await this.generateOrStreamAgentResponse(
                user,
                chatHistoryMessages,
                {
                    prompt,
                    stream: true,
                },
            );
            return response;
        } catch (e) {
            Logger.error('Failed to generate agent thread response:', e);
            throw new Error('Failed to generate agent thread response');
        }
    }

    async generateAgentThreadMessageViz(
        user: SessionUser,
        {
            agentUuid,
            threadUuid,
            messageUuid,
        }: {
            agentUuid: string;
            threadUuid: string;
            messageUuid: string;
        },
    ): Promise<ApiAiAgentThreadMessageViz> {
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

        // Check if user has access to this agent/thread
        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to access this thread',
            );
        }

        const { projectUuid } = agent;

        const message = await this.aiAgentModel.findThreadMessage('assistant', {
            organizationUuid,
            threadUuid,
            messageUuid,
        });

        // @ts-ignore we can keep this runtime check just in case
        if (message.role === 'user') {
            throw new ForbiddenError(
                'User messages are not supported for this endpoint',
            );
        }

        const parsedVizConfig = parseVizConfig(
            message.vizConfigOutput,
            this.lightdashConfig.ai.copilot.maxQueryLimit,
        );

        if (!parsedVizConfig) {
            throw new ForbiddenError('Could not generate a visualization');
        }

        this.analytics.track({
            event: 'ai_agent.web_viz_query',
            userId: user.userUuid,
            properties: {
                projectId: agent.projectUuid,
                organizationId: organizationUuid,
                agentId: agent.uuid,
                agentName: agent.name,
                vizType: parsedVizConfig.type,
            },
        });

        switch (parsedVizConfig.type) {
            case AiResultType.VERTICAL_BAR_RESULT:
                return renderVerticalBarViz({
                    runMetricQuery: (q) =>
                        this.runAiMetricQuery(user, projectUuid, q),
                    vizTool: parsedVizConfig.vizTool,
                    maxLimit: this.lightdashConfig.ai.copilot.maxQueryLimit,
                });
            case AiResultType.TIME_SERIES_RESULT:
                return renderTimeSeriesViz({
                    runMetricQuery: (q) =>
                        this.runAiMetricQuery(user, projectUuid, q),
                    vizTool: parsedVizConfig.vizTool,
                    maxLimit: this.lightdashConfig.ai.copilot.maxQueryLimit,
                });
            case AiResultType.TABLE_RESULT:
                return renderTableViz({
                    runMetricQuery: (q) =>
                        this.runAiMetricQuery(user, projectUuid, q),
                    vizTool: parsedVizConfig.vizTool,
                    maxLimit: this.lightdashConfig.ai.copilot.maxQueryLimit,
                });
            default:
                return assertUnreachable(parsedVizConfig, 'Invalid viz type');
        }
    }

    async getAgentThreadMessageVizQuery(
        user: SessionUser,
        {
            agentUuid,
            threadUuid,
            messageUuid,
        }: {
            agentUuid: string;
            threadUuid: string;
            messageUuid: string;
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

        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });

        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }

        // Check if user has access to this agent/thread
        const hasAccess = await this.checkAgentThreadAccess(
            user,
            agent,
            thread.user.uuid,
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to access this thread',
            );
        }

        const { projectUuid } = agent;

        const message = await this.aiAgentModel.findThreadMessage('assistant', {
            organizationUuid,
            threadUuid,
            messageUuid,
        });

        // @ts-ignore we can keep this runtime check just in case
        if (message.role === 'user') {
            throw new ForbiddenError(
                'User messages are not supported for this endpoint',
            );
        }

        if (!message.vizConfigOutput) {
            throw new ForbiddenError('Viz config not found for this message');
        }

        const parsedVizConfig = parseVizConfig(
            message.vizConfigOutput,
            this.lightdashConfig.ai.copilot.maxQueryLimit,
        );

        if (!parsedVizConfig) {
            throw new ForbiddenError('Could not generate a visualization');
        }

        const query = await this.executeAsyncAiMetricQuery(
            user,
            projectUuid,
            parsedVizConfig.metricQuery,
        );

        const metadata = {
            title: parsedVizConfig.vizTool?.title ?? null,
            description: parsedVizConfig.vizTool?.description ?? null,
        } satisfies AiVizMetadata;

        this.analytics.track({
            event: 'ai_agent.web_viz_query',
            userId: user.userUuid,
            properties: {
                projectId: agent.projectUuid,
                organizationId: organizationUuid,
                agentId: agent.uuid,
                agentName: agent.name,
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
    ) {
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

        await this.aiAgentModel.updateHumanScore({
            promptUuid: messageUuid,
            humanScore,
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

        const agentSettings =
            'slackChannelId' in prompt
                ? await this.aiAgentModel.getAgentBySlackChannelId({
                      organizationUuid: user.organizationUuid,
                      slackChannelId: prompt.slackChannelId,
                  })
                : await this.aiAgentModel.getAgent({
                      organizationUuid: prompt.organizationUuid,
                      agentUuid: prompt.agentUuid!,
                  });

        return agentSettings;
    }

    async getChatHistoryFromThreadMessages(
        // TODO: move getThreadMessages to AiAgentModel and improve types
        // also, it should be called through a service method...
        threadMessages: Awaited<
            ReturnType<typeof AiAgentModel.prototype.getThreadMessages>
        >,
    ): Promise<CoreMessage[]> {
        const messagesWithToolCalls = await Promise.all(
            threadMessages.map(async (message) => {
                const messages: CoreMessage[] = [
                    {
                        role: 'user',
                        content: message.prompt,
                    } satisfies CoreUserMessage,
                ];

                const toolCallsAndResults =
                    await this.aiAgentModel.getToolCallsAndResultsForPrompt(
                        message.ai_prompt_uuid,
                    );

                if (toolCallsAndResults.length > 0) {
                    messages.push({
                        role: 'assistant',
                        content: toolCallsAndResults.map(
                            (toolCallAndResult) =>
                                ({
                                    type: 'tool-call',
                                    toolCallId: toolCallAndResult.tool_call_id,
                                    toolName: toolCallAndResult.tool_name,
                                    args: toolCallAndResult.tool_args,
                                } satisfies ToolCallPart),
                        ),
                    } satisfies CoreAssistantMessage);

                    messages.push({
                        role: 'tool',
                        content: toolCallsAndResults.map(
                            (toolCallAndResult) =>
                                ({
                                    type: 'tool-result',
                                    toolCallId: toolCallAndResult.tool_call_id,
                                    toolName: toolCallAndResult.tool_name,
                                    result: toolCallAndResult.result,
                                } satisfies ToolResultPart),
                        ),
                    } satisfies CoreToolMessage);
                }

                if (message.response) {
                    messages.push({
                        role: 'assistant',
                        content: message.response,
                    } satisfies CoreAssistantMessage);
                }

                if (message.human_score) {
                    messages.push({
                        role: 'user',
                        content:
                            // TODO: we don't have a neutral option, we are storing -1 and 1 at the moment
                            message.human_score > 0
                                ? 'I liked this response'
                                : 'I did not like this response',
                    } satisfies CoreUserMessage);
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

                const { data: tables, pagination } =
                    await this.catalogService.searchCatalog({
                        projectUuid,
                        catalogSearch: {
                            type: CatalogType.Table,
                            yamlTags: agentSettings.tags ?? undefined,
                            tables: args.tableName
                                ? [args.tableName]
                                : undefined,
                        },
                        userAttributes,
                        context: CatalogSearchContext.AI_AGENT,
                        paginateArgs: {
                            page: args.page,
                            pageSize: args.pageSize,
                        },
                        fullTextSearchOperator: 'OR',
                    });

                const tablesWithFields = await Promise.all(
                    tables
                        .filter((table) => table.type === CatalogType.Table)
                        .map(async (table) => {
                            if (!args.includeFields) {
                                return {
                                    table,
                                    dimensions: [],
                                    metrics: [],
                                    dimensionsPagination: undefined,
                                    metricsPagination: undefined,
                                };
                            }

                            if (
                                !args.fieldSearchSize ||
                                !args.fieldOverviewSearchSize
                            ) {
                                throw new Error(
                                    'fieldSearchSize and fieldOverviewSearchSize are required when includeFields is true',
                                );
                            }

                            const sharedArgs = {
                                projectUuid,
                                catalogSearch: {
                                    type: CatalogType.Field,
                                    yamlTags: agentSettings.tags ?? undefined,
                                    tables: [table.name],
                                },
                                userAttributes,
                                context: CatalogSearchContext.AI_AGENT,
                                paginateArgs: {
                                    page: 1,
                                    pageSize: args.tableName
                                        ? args.fieldSearchSize
                                        : args.fieldOverviewSearchSize,
                                },
                                sortArgs: {
                                    sort: 'chartUsage',
                                    order: 'desc' as const,
                                },
                            };

                            const {
                                data: dimensions,
                                pagination: dimensionsPagination,
                            } = await this.catalogService.searchCatalog({
                                ...sharedArgs,
                                catalogSearch: {
                                    ...sharedArgs.catalogSearch,
                                    filter: CatalogFilter.Dimensions,
                                },
                                fullTextSearchOperator: 'OR',
                            });

                            const {
                                data: metrics,
                                pagination: metricsPagination,
                            } = await this.catalogService.searchCatalog({
                                ...sharedArgs,
                                catalogSearch: {
                                    ...sharedArgs.catalogSearch,
                                    filter: CatalogFilter.Metrics,
                                },
                                fullTextSearchOperator: 'OR',
                            });

                            return {
                                table,
                                dimensions: dimensions.filter(
                                    (d) => d.type === CatalogType.Field,
                                ),
                                metrics: metrics.filter(
                                    (m) => m.type === CatalogType.Field,
                                ),
                                dimensionsPagination,
                                metricsPagination,
                            };
                        }),
                );

                return {
                    tablesWithFields,
                    pagination,
                };
            });

        const getExplore: GetExploreFn = async ({ exploreName }) => {
            const agentSettings = await this.getAgentSettings(user, prompt);

            const account = fromSession(user);
            const explore = await this.getExplore(
                account,
                projectUuid,
                agentSettings.tags,
                exploreName,
            );

            return explore;
        };

        const findFields: FindFieldFn = async (args) => {
            const userAttributes =
                await this.userAttributesModel.getAttributeValuesForOrgMember({
                    organizationUuid,
                    userUuid: user.userUuid,
                });

            const agentSettings = await this.getAgentSettings(user, prompt);

            const { data: catalogItems, pagination } =
                await this.catalogService.searchCatalog({
                    projectUuid,
                    catalogSearch: {
                        type: CatalogType.Field,
                        searchQuery: args.fieldSearchQuery.label,
                        yamlTags: agentSettings.tags ?? undefined,
                    },
                    context: CatalogSearchContext.AI_AGENT,
                    paginateArgs: {
                        page: args.page,
                        pageSize: args.pageSize,
                    },
                    userAttributes,
                    fullTextSearchOperator: 'OR',
                });

            // TODO: we should not filter here, search should be returning a proper type
            const catalogFields = catalogItems.filter(
                (item) => item.type === CatalogType.Field,
            );

            return { fields: catalogFields, pagination };
        };

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

        const runMiniMetricQuery: RunMiniMetricQueryFn = async (
            metricQuery,
        ) => {
            const explore = await getExplore({
                exploreName: metricQuery.exploreName,
            });

            const metricQueryFields = [
                ...metricQuery.dimensions,
                ...metricQuery.metrics,
            ];

            validateSelectedFieldsExistence(explore, metricQueryFields);

            const account = fromSession(user);
            return this.projectService.runMetricQuery({
                account,
                projectUuid,
                metricQuery: {
                    ...metricQuery,
                    // TODO: add tableCalculations
                    tableCalculations: [],
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
        };

        const sendFile: SendFileFn = async (args) => {
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

            await this.slackClient.postFileToThread(args);
        };

        const storeToolCall: StoreToolCallFn = async (data) => {
            await this.aiAgentModel.createToolCall(data);
        };

        const storeToolResults: StoreToolResultsFn = async (data) => {
            await this.aiAgentModel.createToolResults(data);
        };

        const findDashboards: FindDashboardsFn = async (args) => {
            const searchResults = await this.searchModel.searchDashboards(
                projectUuid,
                args.dashboardSearchQuery.label,
                undefined,
                'OR',
            );

            const filteredResults = await this.spaceService.filterBySpaceAccess(
                user,
                searchResults,
            );

            const totalResults = filteredResults.length;
            const totalPageCount = Math.ceil(totalResults / args.pageSize);

            return {
                dashboards: filteredResults,
                pagination: {
                    page: args.page,
                    pageSize: args.pageSize,
                    totalPageCount,
                    totalResults,
                },
            };
        };

        const findCharts: FindChartsFn = async (args) => {
            const allCharts = await this.searchModel.searchAllCharts(
                projectUuid,
                args.chartSearchQuery.label,
                'OR',
            );

            const filteredResults = await this.spaceService.filterBySpaceAccess(
                user,
                allCharts,
            );

            const totalResults = filteredResults.length;
            const totalPageCount = Math.ceil(totalResults / args.pageSize);

            return {
                charts: filteredResults,
                pagination: {
                    page: args.page,
                    pageSize: args.pageSize,
                    totalPageCount,
                    totalResults,
                },
            };
        };

        return {
            findCharts,
            findDashboards,
            findFields,
            findExplores,
            getExplore,
            updateProgress,
            getPrompt,
            runMiniMetricQuery,
            sendFile,
            storeToolCall,
            storeToolResults,
        };
    }

    async generateOrStreamAgentResponse(
        user: SessionUser,
        messageHistory: CoreMessage[],
        options: {
            prompt: AiWebAppPrompt;
            stream: true;
        },
    ): Promise<ReturnType<typeof streamAgentResponse>>;
    async generateOrStreamAgentResponse(
        user: SessionUser,
        messageHistory: CoreMessage[],
        options: {
            prompt: AiWebAppPrompt;
            stream: false;
        },
    ): Promise<string>;
    async generateOrStreamAgentResponse(
        user: SessionUser,
        messageHistory: CoreMessage[],
        options: {
            prompt: SlackPrompt;
            stream: false;
        },
    ): Promise<string>;
    async generateOrStreamAgentResponse(
        user: SessionUser,
        messageHistory: CoreMessage[],
        options:
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
              },
    ): Promise<string | ReturnType<typeof streamAgentResponse>> {
        if (!user.organizationUuid) {
            throw new Error('Organization not found');
        }

        if (!(await this.getIsCopilotEnabled(user))) {
            throw new Error('AI Copilot is not enabled');
        }

        const { prompt, stream } = options;

        const {
            findCharts,
            findDashboards,
            findFields,
            findExplores,
            getExplore,
            updateProgress,
            getPrompt,
            runMiniMetricQuery,
            sendFile,
            storeToolCall,
            storeToolResults,
        } = this.getAiAgentDependencies(user, prompt);

        const { model, callOptions } = getModel(
            this.lightdashConfig.ai.copilot,
        );
        const agentSettings = await this.getAgentSettings(user, prompt);

        const args: AiAgentArgs = {
            organizationId: user.organizationUuid,
            userId: user.userUuid,

            threadUuid: prompt.threadUuid,
            promptUuid: prompt.promptUuid,

            agentSettings,
            model,
            callOptions,
            messageHistory,

            debugLoggingEnabled:
                this.lightdashConfig.ai.copilot.debugLoggingEnabled,
            telemetryEnabled: this.lightdashConfig.ai.copilot.telemetryEnabled,

            availableExploresPageSize: 100,
            findExploresPageSize: 15,
            findExploresFieldSearchSize: 200,
            findExploresFieldOverviewSearchSize: 5,
            findExploresMaxDescriptionLength: 100,
            findFieldsPageSize: 10,
            findDashboardsPageSize: 5,
            findChartsPageSize: 5,
            maxQueryLimit: this.lightdashConfig.ai.copilot.maxQueryLimit,
            siteUrl: this.lightdashConfig.siteUrl,
        };

        const dependencies: AiAgentDependencies = {
            findCharts,
            findDashboards,
            findFields,
            findExplores,
            getExplore,
            runMiniMetricQuery,
            getPrompt,
            sendFile,
            storeToolCall,
            storeToolResults,
            updateProgress: (progress: string) => updateProgress(progress),
            updatePrompt: (
                update: UpdateSlackResponse | UpdateWebAppResponse,
            ) => this.aiAgentModel.updateModelResponse(update),
            trackEvent: (event: AiAgentResponseStreamed) =>
                this.analytics.track(event),
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

        const slackTagRegex = /^.*?(<@U\d+\w*?>)/g;

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

        let name: string | undefined;
        if (thread.agentUuid) {
            const agent = await this.getAgent(user, thread.agentUuid);
            name = agent.name;
        }

        let response: string | undefined;
        try {
            const chatHistoryMessages =
                await this.getChatHistoryFromThreadMessages(threadMessages);

            response = await this.generateOrStreamAgentResponse(
                user,
                chatHistoryMessages,
                {
                    prompt: slackPrompt,
                    stream: false,
                },
            );
        } catch (e) {
            await this.slackClient.postMessage({
                organizationUuid: slackPrompt.organizationUuid,
                text: `🔴 Co-pilot failed to generate a response 😥 Please try again.`,
                channel: slackPrompt.slackChannelId,
                thread_ts: slackPrompt.slackThreadTs,
                username: name,
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

        await this.slackClient.deleteMessage({
            organizationUuid: slackPrompt.organizationUuid,
            channelId: slackPrompt.slackChannelId,
            messageTs: slackPrompt.response_slack_ts,
        });

        const feedbackBlocks = getFeedbackBlocks(slackPrompt);
        const followUpToolBlocks = getFollowUpToolBlocks(slackPrompt);
        const exploreBlocks = getExploreBlocks(
            slackPrompt,
            this.lightdashConfig.siteUrl,
            this.lightdashConfig.ai.copilot.maxQueryLimit,
        );
        const historyBlocks = getDeepLinkBlocks(
            slackPrompt,
            this.lightdashConfig.siteUrl,
        );

        // ! This is needed because the markdownToBlocks escapes all characters and slack just needs &, <, > to be escaped
        // ! https://api.slack.com/reference/surfaces/formatting#escaping
        const slackifiedMarkdown = slackifyMarkdown(response);

        const newResponse = await this.slackClient.postMessage({
            organizationUuid: slackPrompt.organizationUuid,
            text: slackifiedMarkdown,
            username: name,
            channel: slackPrompt.slackChannelId,
            thread_ts: slackPrompt.slackThreadTs,
            unfurl_links: false,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: slackifiedMarkdown,
                    },
                },
                ...exploreBlocks,
                ...followUpToolBlocks,
                ...feedbackBlocks,
                ...historyBlocks,
            ],
        });

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
    }

    // TODO: This is to get conversations for the "old" page - remove
    async getConversations(
        user: SessionUser,
        projectUuid: string,
    ): Promise<AiConversation[]> {
        if (!(await this.getIsCopilotEnabled(user))) {
            throw new Error('AI Copilot is not enabled');
        }

        if (!user.organizationUuid) {
            throw new Error('Organization not found');
        }

        const threads = await this.aiAgentModel.getThreads(
            user.organizationUuid,
            projectUuid,
        );

        return threads.map((thread) => ({
            threadUuid: thread.ai_thread_uuid,
            createdAt: thread.created_at,
            createdFrom: thread.created_from,
            firstMessage: thread.prompt,
            user: {
                uuid: thread.user_uuid,
                name: thread.user_name,
            },
        }));
    }

    // TODO: this is to get messages for the "old" page - remove
    async getConversationMessages(
        user: SessionUser,
        projectUuid: string,
        aiThreadUuid: string,
    ): Promise<AiConversationMessage[]> {
        if (!(await this.getIsCopilotEnabled(user))) {
            throw new Error('AI Copilot is not enabled');
        }

        const { organizationUuid } = user;

        if (!organizationUuid) {
            throw new Error('Organization not found');
        }

        const canViewProject = user.ability.can(
            'view',
            subject('Project', {
                organizationUuid,
                projectUuid,
            }),
        );

        if (!canViewProject) {
            throw new Error('User does not have access to the project!');
        }

        const messages = await this.aiAgentModel.getThreadMessages(
            organizationUuid,
            projectUuid,
            aiThreadUuid,
        );

        return messages.map((message) => ({
            promptUuid: message.ai_prompt_uuid,
            message: message.prompt,
            createdAt: message.created_at,
            response: message.response ?? undefined,
            respondedAt: message.responded_at ?? undefined,
            vizConfigOutput: message.viz_config_output ?? undefined,
            humanScore: message.human_score ?? undefined,
            user: {
                uuid: message.user_uuid,
                name: message.user_name,
            },
        }));
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
    static handleClickExploreButton(app: App) {
        app.action('actions.explore_button_click', async ({ ack, respond }) => {
            await ack();
        });
    }

    static handleClickOAuthButton(app: App) {
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

    private handlePromptUpvote(app: App) {
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

    private handlePromptDownvote(app: App) {
        app.action(
            'prompt_human_score.downvote',
            async ({ ack, body, respond, context }) => {
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
                    }
                }
            },
        );
    }

    private handleExecuteFollowUpTool(app: App) {
        Object.values(FollowUpTools).forEach((tool) => {
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
    private async handleAppMention({
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
        let name: string | undefined;
        let threadMessages: ThreadMessageContext | undefined;

        try {
            const agentConfig =
                await this.aiAgentModel.getAgentBySlackChannelId({
                    organizationUuid,
                    slackChannelId: event.channel,
                });

            name = agentConfig.name;

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
            if (e instanceof AiDuplicateSlackPromptError) {
                Logger.debug('Failed to create slack prompt:', e);
                return;
            }

            if (e instanceof AiAgentNotFoundError) {
                Logger.debug('Failed to find ai agent:', e);
                return;
            }

            throw e;
        }

        const postedMessage = await say({
            username: name,
            thread_ts: event.ts,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: createdThread
                            ? `Hi <@${event.user}>, working on your request now :rocket:`
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
            projectUuid: '', // TODO: add project uuid
            organizationUuid,
        });
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

    public async getAgentExploreAccessSummary(
        account: Account,
        projectUuid: string,
        tags: string[] | null,
    ) {
        const exploreSummaries =
            await this.projectService.getAllExploresSummary(
                account,
                projectUuid,
                false,
            );

        const allExplores = await Promise.all(
            exploreSummaries.map((explore) =>
                this.projectService.getExplore(
                    account,
                    projectUuid,
                    explore.name,
                ),
            ),
        );

        const filteredExplores = allExplores
            .map((explore) =>
                filterExploreByTags({ availableTags: tags, explore }),
            )
            .filter((explore) => explore !== undefined);

        const exploreAccessSummary = filteredExplores.map((explore) => ({
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
}
