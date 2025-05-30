import {
    AiAgentThread,
    AiAgentThreadSummary,
    AiMetricQuery,
    ApiCreateAiAgent,
    ApiUpdateAiAgent,
    CommercialFeatureFlags,
    EE_SCHEDULER_TASKS,
    filterExploreByTags,
    ForbiddenError,
    LightdashUser,
    NotFoundError,
    QueryExecutionContext,
    type SessionUser,
} from '@lightdash/common';
import _ from 'lodash';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../services/ProjectService/ProjectService';
import { AiAgentModel } from '../models/AiAgentModel';
import { AiModel } from '../models/AiModel';
import type { CommercialSlackAuthenticationModel } from '../models/CommercialSlackAuthenticationModel';
import { CommercialSchedulerClient } from '../scheduler/SchedulerClient';
import { csvFileConfigSchema, renderCsvFile } from './AiService/charts/csvFile';
import {
    renderTimeseriesChart,
    timeSeriesMetricChartConfigSchema,
} from './AiService/charts/timeSeriesChart';
import {
    renderVerticalBarMetricChart,
    verticalBarMetricChartConfigSchema,
} from './AiService/charts/verticalBarChart';
import {
    AI_DEFAULT_MAX_QUERY_LIMIT,
    validateSelectedFieldsExistence,
} from './AiService/utils/aiCopilot/validators';

type AiAgentServiceDependencies = {
    aiAgentModel: AiAgentModel;
    aiModel: AiModel;
    slackAuthenticationModel: CommercialSlackAuthenticationModel;
    featureFlagService: FeatureFlagService;
    projectService: ProjectService;
    slackClient: SlackClient;
    schedulerClient: CommercialSchedulerClient;
};

export class AiAgentService {
    private readonly aiAgentModel: AiAgentModel;

    private readonly aiModel: AiModel;

    private readonly slackAuthenticationModel: CommercialSlackAuthenticationModel;

    private readonly featureFlagService: FeatureFlagService;

    private readonly projectService: ProjectService;

    private readonly slackClient: SlackClient;

    private readonly schedulerClient: CommercialSchedulerClient;

    constructor(dependencies: AiAgentServiceDependencies) {
        this.aiAgentModel = dependencies.aiAgentModel;
        this.aiModel = dependencies.aiModel;
        this.slackAuthenticationModel = dependencies.slackAuthenticationModel;
        this.featureFlagService = dependencies.featureFlagService;
        this.projectService = dependencies.projectService;
        this.slackClient = dependencies.slackClient;
        this.schedulerClient = dependencies.schedulerClient;
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
                organization_uuid: user.organizationUuid,
            },
        });
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

    public async getAgent(user: SessionUser, agentUuid: string) {
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
        });

        return agent;
    }

    public async listAgents(user: SessionUser) {
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

        const agents = await this.aiAgentModel.findAllAgents({
            organizationUuid,
        });

        return agents;
    }

    async listAgentThreads(
        user: SessionUser,
        agentUuid: string,
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

        const threads = await this.aiAgentModel.findThreads({
            organizationUuid,
            agentUuid,
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

    public async createAgent(user: SessionUser, body: ApiCreateAiAgent) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
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

        const updatedAgent = await this.aiAgentModel.updateAgent({
            agentUuid,
            name: body.name,
            projectUuid: body.projectUuid,
            organizationUuid,
            tags: body.tags,
            integrations: body.integrations,
            instruction: body.instruction,
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

        if (agent.organizationUuid !== organizationUuid) {
            throw new ForbiddenError('Agent not found');
        }

        return this.aiAgentModel.deleteAgent({
            organizationUuid,
            agentUuid,
        });
    }

    async generateAgentThreadResponse(
        user: SessionUser,
        {
            agentUuid,
            threadUuid: threadUuidParam,
            prompt,
        }: {
            agentUuid: string;
            prompt: string;
            threadUuid?: string;
        },
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

        let threadUuid: string | undefined;

        if (threadUuidParam) {
            const thread = await this.aiAgentModel.getThread({
                organizationUuid,
                agentUuid,
                threadUuid: threadUuidParam,
            });
            if (!thread) {
                throw new NotFoundError(`Thread not found: ${threadUuidParam}`);
            }
            threadUuid = thread.uuid;
        } else {
            threadUuid = await this.aiModel.createWebAppThread({
                organizationUuid,
                projectUuid: agent.projectUuid,
                userUuid: user.userUuid,
                createdFrom: 'web_app',
                agentUuid,
            });
        }

        if (!threadUuid) {
            throw new Error('Failed to create agent thread');
        }

        const webAppPromptUuid = await this.aiModel.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: user.userUuid,
            prompt,
        });

        if (!webAppPromptUuid) {
            throw new Error('Failed to create agent thread prompt');
        }

        const { jobId } = await this.schedulerClient.aiAgentThreadGenerate({
            agentUuid,
            threadUuid,
            promptUuid: webAppPromptUuid,
            userUuid: user.userUuid,
            organizationUuid,
            projectUuid: agent.projectUuid,
        });

        return { jobId, threadUuid };
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
    ): Promise<{
        results: Awaited<
            ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
        >;
        metricQuery: AiMetricQuery;
        vizConfig?: object;
    }> {
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

        const verticalBarMetricChartConfig =
            verticalBarMetricChartConfigSchema.safeParse(
                message.vizConfigOutput,
            );
        const timeSeriesMetricChartConfig =
            timeSeriesMetricChartConfigSchema.safeParse(
                message.vizConfigOutput,
            );
        const csvFileConfig = csvFileConfigSchema.safeParse(
            message.vizConfigOutput,
        );

        // FIXME: viz config should have a type so we can use an exhaustive switch
        if (verticalBarMetricChartConfig.success) {
            return renderVerticalBarMetricChart({
                runMetricQuery: (q) => {
                    console.log({ projectUuid, q });
                    return this.runAiMetricQuery(user, projectUuid, q);
                },
                vizConfig: verticalBarMetricChartConfig.data,
                filters: message.filtersOutput ?? undefined,
            });
        }

        if (timeSeriesMetricChartConfig.success) {
            return renderTimeseriesChart({
                runMetricQuery: (q) =>
                    this.runAiMetricQuery(user, projectUuid, q),
                vizConfig: timeSeriesMetricChartConfig.data,
                filters: message.filtersOutput ?? undefined,
            });
        }

        if (csvFileConfig.success) {
            return renderCsvFile({
                runMetricQuery: (q) =>
                    this.runAiMetricQuery(user, projectUuid, q),
                config: csvFileConfig.data,
                filters: message.filtersOutput ?? undefined,
                maxLimit: AI_DEFAULT_MAX_QUERY_LIMIT,
            });
        }

        throw new ForbiddenError('Invalid viz config');
    }
}
