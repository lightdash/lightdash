import { subject } from '@casl/ability';
import {
    AiAgentThread,
    AiAgentThreadSummary,
    AiAgentUserPreferences,
    AiChartType,
    AiConversation,
    AiConversationMessage,
    AiDuplicateSlackPromptError,
    AiMetricQuery,
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
    filterExploreByTags,
    ForbiddenError,
    isSlackPrompt,
    LightdashUser,
    NotFoundError,
    QueryExecutionContext,
    SlackPrompt,
    UnexpectedServerError,
    UpdateSlackResponse,
    UpdateWebAppResponse,
    type SessionUser,
} from '@lightdash/common';
import { MessageElement } from '@slack/web-api/dist/response/ConversationsHistoryResponse';
import { CoreMessage } from 'ai';
import _, { pick } from 'lodash';
import slackifyMarkdown from 'slackify-markdown';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { UserModel } from '../../models/UserModel';
import { AsyncQueryService } from '../../services/AsyncQueryService/AsyncQueryService';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../services/ProjectService/ProjectService';
import { AiAgentModel } from '../models/AiAgentModel';
import { CommercialSchedulerClient } from '../scheduler/SchedulerClient';
import { generateAgentResponse, streamAgentResponse } from './ai/agents/agent';
import { generateEmbeddingsNameAndDescription } from './ai/embeds/embed';
import { getModel } from './ai/models';
import { getChatHistoryFromThreadMessages } from './ai/prompts/conversationHistory';
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
import {
    AI_DEFAULT_MAX_QUERY_LIMIT,
    validateSelectedFieldsExistence,
} from './ai/utils/validators';
import {
    isCsvFileConfig,
    metricQueryCsv,
    renderCsvFile,
} from './ai/visualizations/csvFile';
import {
    isTimeSeriesMetricChartConfig,
    metricQueryTimeSeriesChartMetric,
    renderTimeseriesChart,
} from './ai/visualizations/timeSeriesChart';
import { AiAgentVizConfig } from './ai/visualizations/types';
import {
    isVerticalBarMetricChartConfig,
    metricQueryVerticalBarChartMetric,
    renderVerticalBarMetricChart,
} from './ai/visualizations/verticalBarChart';
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
    schedulerClient: CommercialSchedulerClient;
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

    private readonly schedulerClient: CommercialSchedulerClient;

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
        this.schedulerClient = dependencies.schedulerClient;
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
        metricQuery: AiMetricQuery,
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
        metricQuery: AiMetricQuery,
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
                metricQuery: { ...metricQuery, tableCalculations: [] },
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
                getChatHistoryFromThreadMessages(threadMessages);

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

        if (!message.metricQuery || !message.vizConfigOutput) {
            throw new ForbiddenError(
                'Viz config or metric query not found for this message',
            );
        }

        let vizConfig: AiAgentVizConfig;
        if (isVerticalBarMetricChartConfig(message.vizConfigOutput)) {
            vizConfig = {
                type: 'vertical_bar_chart',
                config: message.vizConfigOutput,
            };
        } else if (isTimeSeriesMetricChartConfig(message.vizConfigOutput)) {
            vizConfig = {
                type: 'time_series_chart',
                config: message.vizConfigOutput,
            };
        } else if (isCsvFileConfig(message.vizConfigOutput)) {
            vizConfig = {
                type: 'csv',
                config: message.vizConfigOutput,
            };
        } else {
            throw new UnexpectedServerError('Invalid viz config');
        }

        this.analytics.track({
            event: 'ai_agent.web_viz_query',
            userId: user.userUuid,
            properties: {
                projectId: agent.projectUuid,
                organizationId: organizationUuid,
                agentId: agent.uuid,
                agentName: agent.name,
                vizType: vizConfig.type,
            },
        });

        switch (vizConfig.type) {
            case 'vertical_bar_chart':
                return renderVerticalBarMetricChart({
                    runMetricQuery: (q) =>
                        this.runAiMetricQuery(user, projectUuid, q),
                    vizConfig: vizConfig.config,
                    // TODO: validate before casting
                    filters: message.filtersOutput ?? undefined,
                });
            case 'time_series_chart':
                return renderTimeseriesChart({
                    runMetricQuery: (q) =>
                        this.runAiMetricQuery(user, projectUuid, q),
                    vizConfig: vizConfig.config,
                    // TODO: validate before casting
                    filters: message.filtersOutput ?? undefined,
                });
            case 'csv':
                return renderCsvFile({
                    runMetricQuery: (q) =>
                        this.runAiMetricQuery(user, projectUuid, q),
                    config: vizConfig.config,
                    // TODO: validate before casting
                    filters: message.filtersOutput ?? undefined,
                    maxLimit: AI_DEFAULT_MAX_QUERY_LIMIT,
                });
            default:
                return assertUnreachable(vizConfig, 'Invalid viz config');
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

        if (!message.metricQuery || !message.vizConfigOutput) {
            throw new ForbiddenError(
                'Viz config or metric query not found for this message',
            );
        }

        const metadata = {
            title:
                'title' in message.vizConfigOutput &&
                typeof message.vizConfigOutput.title === 'string'
                    ? message.vizConfigOutput.title
                    : null,
            description:
                'description' in message.vizConfigOutput &&
                typeof message.vizConfigOutput.description === 'string'
                    ? message.vizConfigOutput.description
                    : null,
        } satisfies AiVizMetadata;

        let vizConfig: AiAgentVizConfig;
        if (isVerticalBarMetricChartConfig(message.vizConfigOutput)) {
            vizConfig = {
                type: 'vertical_bar_chart',
                config: message.vizConfigOutput,
            };
        } else if (isTimeSeriesMetricChartConfig(message.vizConfigOutput)) {
            vizConfig = {
                type: 'time_series_chart',
                config: message.vizConfigOutput,
            };
        } else if (isCsvFileConfig(message.vizConfigOutput)) {
            vizConfig = {
                type: 'csv',
                config: message.vizConfigOutput,
            };
        } else {
            throw new UnexpectedServerError('Invalid viz config');
        }

        this.analytics.track({
            event: 'ai_agent.web_viz_query',
            userId: user.userUuid,
            properties: {
                projectId: agent.projectUuid,
                organizationId: organizationUuid,
                agentId: agent.uuid,
                agentName: agent.name,
                vizType: vizConfig.type,
            },
        });

        switch (vizConfig.type) {
            case 'vertical_bar_chart': {
                const metricQuery = metricQueryVerticalBarChartMetric(
                    vizConfig.config,
                    message.filtersOutput ?? undefined,
                );

                const query = await this.executeAsyncAiMetricQuery(
                    user,
                    projectUuid,
                    metricQuery,
                );

                return {
                    type: AiChartType.VERTICAL_BAR_CHART,
                    query,
                    metadata,
                };
            }
            case 'time_series_chart': {
                const metricQuery = metricQueryTimeSeriesChartMetric(
                    vizConfig.config,
                    message.filtersOutput ?? undefined,
                );
                const query = await this.executeAsyncAiMetricQuery(
                    user,
                    projectUuid,
                    metricQuery,
                );

                return {
                    type: AiChartType.TIME_SERIES_CHART,
                    query,
                    metadata,
                };
            }
            case 'csv':
                const metricQuery = await metricQueryCsv(
                    vizConfig.config,
                    AI_DEFAULT_MAX_QUERY_LIMIT,
                    message.filtersOutput ?? undefined,
                );
                const query = await this.executeAsyncAiMetricQuery(
                    user,
                    projectUuid,
                    metricQuery,
                );
                return {
                    type: AiChartType.CSV,
                    query,
                    metadata,
                };
            default:
                return assertUnreachable(vizConfig, 'Invalid viz config');
        }
    }

    // TODO: user permissions
    async updateHumanScoreForMessage(messageUuid: string, humanScore: number) {
        await this.aiAgentModel.updateHumanScore({
            promptUuid: messageUuid,
            humanScore,
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

    // eventually this should become a "getExplores" tool
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

        const explores = await Promise.all(
            exploreSummaries.map((s) =>
                this.projectService.getExplore(user, projectUuid, s.name),
            ),
        );

        const exploresWithDescriptions = explores
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

    // Defines the functions that AI Agent tools can use to interact with the Lightdash backend or slack
    // This is scoped to the project, user and prompt (closure)
    public getAiAgentDependencies(
        user: SessionUser,
        prompt: SlackPrompt | AiWebAppPrompt,
        availableTags: string[] | null,
    ) {
        const { projectUuid, organizationUuid, agentUuid } = prompt;

        const getExplore: GetExploreFn = async ({ exploreName }) => {
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
        const { projectUuid } = prompt;

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

        const {
            getExplore,
            searchFields,
            updateProgress,
            getPrompt,
            runMiniMetricQuery,
            sendFile,
            storeToolCall,
            storeToolResults,
        } = this.getAiAgentDependencies(
            user,
            prompt,
            agentSettings?.tags ?? null,
        );

        const aiAgentExploreSummaries = await this.getMinimalExploreInformation(
            user,
            projectUuid,
            agentSettings?.tags ?? null,
        );

        const model = getModel(this.lightdashConfig.ai.copilot);

        const args = {
            model,
            agentUuid: agentSettings.uuid,
            threadUuid: prompt.threadUuid,
            promptUuid: prompt.promptUuid,
            agentName: agentSettings.name,
            instruction: agentSettings.instruction,
            messageHistory,
            aiAgentExploreSummaries,
            maxLimit: this.lightdashConfig.query.maxLimit,
        };

        const dependencies = {
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
        };

        if (stream) {
            return streamAgentResponse({
                args,
                dependencies,
            });
        }
        return generateAgentResponse({
            args,
            dependencies,
        });
    }

    // TODO: user permissions
    async updateHumanScoreForPrompt(promptUuid: string, humanScore: number) {
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
                getChatHistoryFromThreadMessages(threadMessages);

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
            filtersOutput: message.filters_output ?? undefined,
            metricQuery: message.metric_query ?? undefined,
            humanScore: message.human_score ?? undefined,
            user: {
                uuid: message.user_uuid,
                name: message.user_name,
            },
        }));
    }

    private async _createWebAppPrompt(
        user: LightdashUser,
        projectUuid: string,
        prompt: string,
    ): Promise<string> {
        if (!user.organizationUuid) {
            throw new Error('Organization not found');
        }

        const threadUuid = await this.aiAgentModel.createWebAppThread({
            organizationUuid: user.organizationUuid,
            projectUuid,
            userUuid: user.userUuid,
            createdFrom: 'web_app',
            agentUuid: null,
        });

        if (threadUuid === undefined) {
            throw new Error('Failed to create web app thread');
        }

        const promptUuid = await this.aiAgentModel.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: user.userUuid,
            prompt,
        });

        return promptUuid;
    }

    async createWebAppConversation(
        user: SessionUser,
        projectUuid: string,
        question: string,
    ): Promise<{
        prompt: AiWebAppPrompt;
        rows: Record<string, AnyType>[] | undefined;
    }> {
        if (!(await this.getIsCopilotEnabled(user))) {
            throw new Error('AI Copilot is not enabled');
        }

        const userDetails = await this.userModel.getUserDetailsByUuid(
            user.userUuid,
        );

        if (userDetails.organizationUuid === undefined) {
            throw new Error('Organization not found');
        }

        // TODO: relax this permission after we have a proper UI for copilot/project access
        const canManageProject = user.ability.can(
            'manage',
            subject('Project', {
                organizationUuid: userDetails.organizationUuid,
                projectUuid,
            }),
        );

        if (!canManageProject) {
            throw new Error('User does not have access to the project!');
        }

        await this.aiAgentModel.createWebAppThread({
            organizationUuid: userDetails.organizationUuid,
            projectUuid,
            createdFrom: 'web_app',
            userUuid: user.userUuid,
            agentUuid: null,
        });

        const promptUuid = await this._createWebAppPrompt(
            user,
            projectUuid,
            question,
        );

        const webAppPrompt = await this.aiAgentModel.findWebAppPrompt(
            promptUuid,
        );

        if (!webAppPrompt) {
            throw new Error('Prompt not found');
        }

        const response = await this.generateOrStreamAgentResponse(
            user,
            [{ role: 'user', content: question }],
            {
                prompt: webAppPrompt,
                stream: false,
            },
        );

        await this.aiAgentModel.updateModelResponse({
            promptUuid: webAppPrompt.promptUuid,
            response,
        });

        const finalPrompt = await this.aiAgentModel.findWebAppPrompt(
            promptUuid,
        );

        if (!finalPrompt) {
            throw new Error('Prompt not found');
        }

        // TODO: this can receive project settings/available tags - like we have for slack
        const utils = this.getAiAgentDependencies(user, finalPrompt, null);

        const rows = finalPrompt.metricQuery
            ? (
                  await utils.runMiniMetricQuery(
                      finalPrompt.metricQuery as AiMetricQuery,
                  )
              ).rows
            : undefined;

        return {
            prompt: finalPrompt,
            rows,
        };
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
}
