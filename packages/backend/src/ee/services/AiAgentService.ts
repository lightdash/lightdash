import { subject } from '@casl/ability';
import {
    AiAgent,
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
    AnyType,
    ApiAiAgentThreadCreateRequest,
    ApiAiAgentThreadMessageCreateRequest,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageViz,
    ApiAiAgentThreadMessageVizQuery,
    ApiCreateAiAgent,
    ApiUpdateAiAgent,
    ApiUpdateUserAgentPreferences,
    assertUnreachable,
    CatalogType,
    CommercialFeatureFlags,
    Explore,
    filterExploreByTags,
    ForbiddenError,
    isExploreError,
    isSlackPrompt,
    LightdashUser,
    NotFoundError,
    parseVizConfig,
    QueryExecutionContext,
    SlackPrompt,
    UpdateSlackResponse,
    UpdateWebAppResponse,
    type SessionUser,
} from '@lightdash/common';
import { MessageElement } from '@slack/web-api/dist/response/ConversationsHistoryResponse';
import {
    CoreAssistantMessage,
    CoreMessage,
    CoreToolMessage,
    CoreUserMessage,
    ToolCallPart,
    ToolResultPart,
} from 'ai';
import _, { pick } from 'lodash';
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
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { UserModel } from '../../models/UserModel';
import { AsyncQueryService } from '../../services/AsyncQueryService/AsyncQueryService';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../services/ProjectService/ProjectService';
import { AiAgentModel } from '../models/AiAgentModel';
import { generateAgentResponse, streamAgentResponse } from './ai/agents/agent';
import { generateEmbeddingsNameAndDescription } from './ai/embeds/embed';
import { getModel } from './ai/models';
import {
    GetExploreFn,
    GetPromptFn,
    RunMiniMetricQueryFn,
    SearchFieldsFn,
    SendFileFn,
    StoreToolCallFn,
    StoreToolResultsFn,
    UpdateProgressFn,
} from './ai/types/aiAgentDependencies';
import { AiAgentExploreSummary } from './ai/types/aiAgentExploreSummary';
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
import { CommercialCatalogService } from './CommercialCatalogService';

type AiAgentServiceDependencies = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    userModel: UserModel;
    aiAgentModel: AiAgentModel;
    featureFlagService: FeatureFlagService;
    projectService: ProjectService;
    catalogService: CommercialCatalogService;
    slackClient: SlackClient;
    asyncQueryService: AsyncQueryService;
};

export class AiAgentService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly userModel: UserModel;

    private readonly aiAgentModel: AiAgentModel;

    private readonly featureFlagService: FeatureFlagService;

    private readonly projectService: ProjectService;

    private readonly catalogService: CommercialCatalogService;

    private readonly slackClient: SlackClient;

    private readonly asyncQueryService: AsyncQueryService;

    constructor(dependencies: AiAgentServiceDependencies) {
        this.lightdashConfig = dependencies.lightdashConfig;
        this.analytics = dependencies.analytics;
        this.userModel = dependencies.userModel;
        this.aiAgentModel = dependencies.aiAgentModel;
        this.featureFlagService = dependencies.featureFlagService;
        this.catalogService = dependencies.catalogService;
        this.projectService = dependencies.projectService;
        this.slackClient = dependencies.slackClient;
        this.asyncQueryService = dependencies.asyncQueryService;
    }

    // from AiService getToolUtilities
    private async getExplore(
        user: SessionUser,
        projectUuid: string,
        availableTags: string[] | null,
        exploreName: string,
    ) {
        const explore = await this.projectService.getExplore(
            user,
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

    // from AiService getToolUtilities
    private async runAiMetricQuery(
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

        validateSelectedFieldsExistence(explore, metricQueryFields);

        return this.projectService.runExploreQuery(
            user,
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

        validateSelectedFieldsExistence(explore, metricQueryFields);

        const asyncQuery = await this.asyncQueryService.executeAsyncMetricQuery(
            {
                user,
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

    private async getIsCopilotEnabled(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ) {
        const aiCopilotFlag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });
        return aiCopilotFlag.enabled;
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

        // TODO:
        // permissions

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
            projectUuid,
        });

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

        return agents;
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
                .filter((thread) => thread.user.slackUserId != null)
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
                    thread.user.slackUserId != null &&
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

        if (
            user.ability.cannot(
                'view',
                subject('AiAgentThread', {
                    projectUuid: agent.projectUuid,
                    userUuid: thread.user.uuid,
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
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

        if (
            user.ability.cannot(
                'create',
                subject('AiAgentThread', {
                    organizationUuid,
                    projectUuid: agent.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
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

        const thread = await this.aiAgentModel.findThread(threadUuid);
        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }

        const { organizationUuid, projectUuid } = thread;

        if (thread.organizationUuid !== user.organizationUuid) {
            throw new ForbiddenError();
        }

        const threadMessages = await this.aiAgentModel.getThreadMessages(
            organizationUuid,
            projectUuid,
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
            this.lightdashConfig.query.maxLimit,
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
                    maxLimit: this.lightdashConfig.query.maxLimit,
                });
            case AiResultType.TIME_SERIES_RESULT:
                return renderTimeSeriesViz({
                    runMetricQuery: (q) =>
                        this.runAiMetricQuery(user, projectUuid, q),
                    vizTool: parsedVizConfig.vizTool,
                    maxLimit: this.lightdashConfig.query.maxLimit,
                });
            case AiResultType.TABLE_RESULT:
                return renderTableViz({
                    runMetricQuery: (q) =>
                        this.runAiMetricQuery(user, projectUuid, q),
                    vizTool: parsedVizConfig.vizTool,
                    maxLimit: this.lightdashConfig.query.maxLimit,
                });
            case AiResultType.ONE_LINE_RESULT:
                throw new ForbiddenError(
                    'One line result does not have a visualization',
                );
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
            this.lightdashConfig.query.maxLimit,
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

        const message = await this.aiAgentModel.findThreadMessage('assistant', {
            organizationUuid,
            threadUuid,
            messageUuid,
        });

        if (
            user.ability.cannot(
                'update',
                subject('AiAgentThread', {
                    projectUuid: agent.projectUuid,
                    userUuid: user.userUuid,
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
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

    private async getMinimalExploreInformation(
        user: SessionUser,
        projectUuid: string,
        availableTags: string[] | null,
    ): Promise<AiAgentExploreSummary[]> {
        const exploreSummaries =
            await this.projectService.getAllExploresSummary(
                user,
                projectUuid,
                true,
                false,
            );

        const explores = await this.projectService.findExplores({
            user,
            projectUuid,
            exploreNames: exploreSummaries.map((s) => s.name),
        });

        const exploresWithoutErrors = Object.values(explores).filter(
            (e): e is Explore => !isExploreError(e),
        );

        const exploresWithDescriptions = exploresWithoutErrors
            .map((explore) =>
                filterExploreByTags({
                    explore,
                    availableTags,
                }),
            )
            .filter((explore) => explore !== undefined)
            .map((explore, index) => ({
                ...explore,
                description: exploreSummaries[index]?.description,
            }));

        const minimalExploreInformation = exploresWithDescriptions.map((s) => ({
            ...pick(s, ['name', 'label', 'description', 'baseTable']),
            joinedTables: Object.keys(s.tables).filter(
                (table) => table !== s.baseTable,
            ),
        }));

        return minimalExploreInformation;
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

    private async getChatHistoryFromThreadMessages(
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

        const getExplores = async () => {
            const agentSettings = await this.getAgentSettings(user, prompt);

            return this.getMinimalExploreInformation(
                user,
                projectUuid,
                agentSettings?.tags ?? null,
            );
        };

        const getExplore: GetExploreFn = async ({ exploreName }) => {
            const agentSettings = await this.getAgentSettings(user, prompt);

            const explore = await this.projectService.getExplore(
                user,
                projectUuid,
                exploreName,
            );

            const filteredExplore = filterExploreByTags({
                explore,
                availableTags: agentSettings?.tags ?? null,
            });

            if (!filteredExplore) {
                throw new NotFoundError('Explore not found');
            }

            return filteredExplore;
        };

        const searchFields: SearchFieldsFn = async ({
            exploreName,
            embeddingSearchQueries,
        }: {
            exploreName: string;
            embeddingSearchQueries: Array<{
                name: string;
                description: string;
            }>;
        }) => {
            if (!this.lightdashConfig.ai.copilot.providers?.openai?.apiKey) {
                throw new Error(
                    'Embedding search needs OpenAI API key to be set',
                );
            }

            const embedQueries = await generateEmbeddingsNameAndDescription({
                apiKey: this.lightdashConfig.ai.copilot.providers?.openai
                    ?.apiKey,
                values: embeddingSearchQueries,
            });

            const catalogItems = await this.catalogService.hybridSearch({
                user,
                projectUuid,
                embedQueries,
                exploreName,
                type: CatalogType.Field,
                limit: 30,
            });

            return catalogItems.data.map((item) => item.name);
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

            return this.projectService.runMetricQuery({
                user,
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

        return {
            getExplores,
            getExplore,
            searchFields: this.lightdashConfig.ai.copilot.embeddingSearchEnabled
                ? searchFields
                : undefined,
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
            getExplores,
            getExplore,
            searchFields,
            updateProgress,
            getPrompt,
            runMiniMetricQuery,
            sendFile,
            storeToolCall,
            storeToolResults,
        } = this.getAiAgentDependencies(user, prompt);

        const model = getModel(this.lightdashConfig.ai.copilot);
        const agentSettings = await this.getAgentSettings(user, prompt);

        const args = {
            model,
            agentSettings,
            threadUuid: prompt.threadUuid,
            promptUuid: prompt.promptUuid,
            messageHistory,
            maxLimit: this.lightdashConfig.query.maxLimit,
            organizationId: user.organizationUuid,
            userId: user.userUuid,
        };

        const dependencies = {
            getExplores,
            getExplore,
            searchFields,
            runMiniMetricQuery,
            getPrompt,
            sendFile,
            storeToolCall,
            storeToolResults,
            // avoid binding
            updateProgress: (progress: string) => updateProgress(progress),
            updatePrompt: (
                update: UpdateSlackResponse | UpdateWebAppResponse,
            ) => this.aiAgentModel.updateModelResponse(update),
            trackEvent: (event: AiAgentResponseStreamed) =>
                this.analytics.track(event),
        };

        return stream
            ? streamAgentResponse({
                  args,
                  dependencies,
              })
            : generateAgentResponse({
                  args,
                  dependencies,
              });
    }

    // TODO: user permissions
    async updateHumanScoreForSlackPrompt(
        promptUuid: string,
        humanScore: number,
    ) {
        this.analytics.track<AiAgentPromptFeedbackEvent>({
            event: 'ai_agent_prompt.feedback',
            userId: undefined,
            properties: {
                organizationId: undefined,
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
            this.lightdashConfig.query.maxLimit,
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

        // TODO: this is a temporary solution to check project permissions...
        const projectSummary = await this.projectService.getProject(
            projectUuid,
            user,
        );

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

        const project = await this.projectService.getProject(projectUuid, user);
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

        const project = await this.projectService.getProject(projectUuid, user);
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

        const project = await this.projectService.getProject(projectUuid, user);
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
}
