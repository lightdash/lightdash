import { subject } from '@casl/ability';
import { type TokenUsage } from '@langchain/core/language_models/base';
import {
    AiConversation,
    AiConversationMessage,
    AiMetricQuery,
    AiWebAppPrompt,
    AnyType,
    CatalogType,
    CommercialFeatureFlags,
    DashboardDAO,
    DashboardSummary,
    FeatureFlags,
    ItemsMap,
    LightdashUser,
    NotFoundError,
    QueryExecutionContext,
    SessionUser,
    SlackPrompt,
    UnexpectedServerError,
    filterExploreByTags,
    getErrorMessage,
    getItemId,
    isDashboardChartTileType,
    isField,
    isSlackPrompt,
} from '@lightdash/common';
import { CoreMessage } from 'ai';
import { pick } from 'lodash';
import slackifyMarkdown from 'slackify-markdown';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { SlackClient } from '../../../clients/Slack/SlackClient';
import { LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { OrganizationModel } from '../../../models/OrganizationModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../../models/UserModel';
import { isFeatureFlagEnabled } from '../../../postHog';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import {
    CustomVizGenerated,
    DashboardSummaryCreated,
    DashboardSummaryViewed,
} from '../../analytics';
import OpenAi from '../../clients/OpenAi';
import { AiAgentModel } from '../../models/AiAgentModel';
import { AiModel } from '../../models/AiModel';
import { DashboardSummaryModel } from '../../models/DashboardSummaryModel';
import { runAgent } from '../ai/agent';
import { getChatHistoryFromThreadMessages } from '../ai/prompts/conversationHistory';
import type {
    GetExploreFn,
    GetPromptFn,
    RunMiniMetricQueryFn,
    SendFileFn,
    UpdateProgressFn,
} from '../ai/types/aiAgentDependencies';
import { SearchFieldsFn } from '../ai/types/aiAgentDependencies';
import { AiAgentExploreSummary } from '../ai/types/aiAgentExploreSummary';
import { AiAgentService } from '../AiAgentService';
import { CommercialCatalogService } from '../CommercialCatalogService';
import {
    getDeepLinkBlocks,
    getExploreBlocks,
    getFeedbackBlocks,
    getFollowUpToolBlocks,
} from './utils/aiCopilot/getSlackBlocks';
import { validateSelectedFieldsExistence } from './utils/aiCopilot/validators';
import { AiDuplicateSlackPromptError } from './utils/errors';
import {
    fieldDesc,
    formatSummaryArray,
    makeResultsCSV,
} from './utils/prepareData';
import {
    DEFAULT_CHART_SUMMARY_PROMPT,
    DEFAULT_CUSTOM_VIZ_PROMPT,
    DEFAULT_DASHBOARD_SUMMARY_PROMPT,
} from './utils/prompts';
import { getTotalTokenUsage } from './utils/tokens';

type ChartPromptData = {
    name: string;
    description?: string;
    data: string;
    columns: string[];
    fields: ItemsMap;
};

type Dependencies = {
    analytics: LightdashAnalytics;
    dashboardModel: DashboardModel;
    dashboardSummaryModel: DashboardSummaryModel;
    aiModel: AiModel;
    aiAgentModel: AiAgentModel;
    userModel: UserModel;
    projectModel: ProjectModel;
    organizationModel: OrganizationModel;
    projectService: ProjectService;
    catalogService: CommercialCatalogService;
    openAi: OpenAi;
    slackClient: SlackClient;
    lightdashConfig: LightdashConfig;
    featureFlagService: FeatureFlagService;
    aiAgentService: AiAgentService;
};

export class AiService {
    private readonly analytics: LightdashAnalytics;

    private readonly dashboardModel: DashboardModel;

    private readonly aiModel: AiModel;

    private readonly aiAgentModel: AiAgentModel;

    private readonly userModel: UserModel;

    private readonly projectModel: ProjectModel;

    private readonly organizationModel: OrganizationModel;

    private readonly dashboardSummaryModel: DashboardSummaryModel;

    private readonly projectService: ProjectService;

    private readonly catalogService: CommercialCatalogService;

    private readonly openAi: OpenAi;

    private readonly slackClient: SlackClient;

    private readonly lightdashConfig: LightdashConfig;

    private readonly featureFlagService: FeatureFlagService;

    private readonly aiAgentService: AiAgentService;

    constructor(dependencies: Dependencies) {
        this.analytics = dependencies.analytics;
        this.dashboardModel = dependencies.dashboardModel;
        this.dashboardSummaryModel = dependencies.dashboardSummaryModel;
        this.projectService = dependencies.projectService;
        this.openAi = dependencies.openAi;
        this.aiModel = dependencies.aiModel;
        this.aiAgentModel = dependencies.aiAgentModel;
        this.userModel = dependencies.userModel;
        this.slackClient = dependencies.slackClient;
        this.projectModel = dependencies.projectModel;
        this.catalogService = dependencies.catalogService;
        this.lightdashConfig = dependencies.lightdashConfig;
        this.organizationModel = dependencies.organizationModel;
        this.featureFlagService = dependencies.featureFlagService;
        this.aiAgentService = dependencies.aiAgentService;
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

    private static async throwOnFeatureDisabled(user: SessionUser) {
        const isAIDashboardSummaryEnabled = await isFeatureFlagEnabled(
            'ai-dashboard-summary' as FeatureFlags,
            user,
            {
                throwOnTimeout: true,
            },
        );

        if (!isAIDashboardSummaryEnabled) {
            throw new Error('AI Dashboard summary feature not enabled!');
        }
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

    private async getDashboardChartsResults(
        user: SessionUser,
        dashboard: DashboardDAO,
    ): Promise<ChartPromptData[]> {
        const chartUuids = dashboard.tiles.reduce<string[]>((acc, tile) => {
            if (
                isDashboardChartTileType(tile) &&
                tile.properties.savedChartUuid
            ) {
                return [...acc, tile.properties.savedChartUuid];
            }
            return acc;
        }, []);

        const chartResultPromises = chartUuids.map(async (chartUuid) => {
            const chartAndResults =
                await this.projectService.getChartAndResults({
                    user,
                    dashboardUuid: dashboard.uuid,
                    chartUuid,
                    dashboardFilters: dashboard.filters,
                    dashboardSorts: [],
                    context: QueryExecutionContext.AI,
                });

            const columns = [
                ...chartAndResults.metricQuery.dimensions,
                ...chartAndResults.metricQuery.metrics, // custom metrics are already included here
                ...chartAndResults.metricQuery.tableCalculations.map(
                    (tc) => tc.name,
                ),
                ...(chartAndResults.metricQuery.customDimensions ?? []).map(
                    (cd) => cd.id,
                ),
            ];

            const data = await makeResultsCSV(columns, chartAndResults.rows);

            return {
                name: chartAndResults.chart.name,
                description: chartAndResults.chart.description,
                data,
                columns,
                fields: chartAndResults.fields,
            };
        });

        return Promise.all(chartResultPromises);
    }

    async createChartSummary(chartData: ChartPromptData) {
        const fieldInsights = chartData.columns
            .map((col) => fieldDesc(col, chartData.fields[col]))
            .join('\n');

        return this.openAi.run(DEFAULT_CHART_SUMMARY_PROMPT, {
            chart_data: chartData.data,
            field_insights: fieldInsights,
            chart_name: chartData.name,
            chart_description: chartData.description ?? '',
        });
    }

    async generateCustomViz({
        user,
        projectUuid,
        prompt,
        itemsMap,
        sampleResults,
        currentVizConfig,
    }: {
        user: SessionUser;
        projectUuid: string;
        prompt: string;
        itemsMap: ItemsMap;
        sampleResults: {
            [k: string]: unknown;
        }[];
        currentVizConfig: string;
    }) {
        const isAICustomVizEnabled = await isFeatureFlagEnabled(
            FeatureFlags.AiCustomViz,
            user,
            {
                throwOnTimeout: true,
            },
        );

        if (!isAICustomVizEnabled) {
            throw new Error('AI Custom viz feature not enabled!');
        }
        let openAiResponse: {
            result: string;
            tokenUsage: TokenUsage | undefined;
        };

        const fields = Object.values(itemsMap).map((item) => ({
            id: getItemId(item),
            name: item.name,
            type: item.type,
            fieldType: isField(item) ? item.fieldType : undefined,
        }));

        const startTime = new Date().getTime();

        try {
            openAiResponse = await this.openAi.run(DEFAULT_CUSTOM_VIZ_PROMPT, {
                user_prompt: prompt,
                fields: JSON.stringify(fields),
                sample_data: JSON.stringify(sampleResults),
                current_viz_config: currentVizConfig,
            });
        } catch (e) {
            const errorCode =
                e instanceof Error && 'code' in e ? e.code : getErrorMessage(e);
            throw new Error(`Failed to generate vega config - ${errorCode}`);
        }

        const { result: vegaConfigResult, tokenUsage } = openAiResponse;

        const timeOpenAi = new Date().getTime() - startTime;

        const totalTokenUsages = [tokenUsage].filter(
            (t): t is TokenUsage => t !== undefined,
        );

        const totalTokens = getTotalTokenUsage(totalTokenUsages);

        if (this.openAi.model === undefined) {
            throw new UnexpectedServerError('OpenAi model is not initialized');
        }

        this.analytics.track<CustomVizGenerated>({
            userId: user.userUuid,
            event: 'ai.custom_viz.generated',
            properties: {
                openAIModelName: this.openAi.model.modelName,
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                prompt,
                responseSize: vegaConfigResult.length,
                tokenUsage: totalTokens,
                timeOpenAi,
            },
        });

        return vegaConfigResult;
    }

    async createDashboardSummary(
        user: SessionUser,
        projectUuid: string,
        dashboardUuid: string,
        opts: Pick<DashboardSummary, 'context' | 'tone' | 'audiences'>,
    ) {
        await AiService.throwOnFeatureDisabled(user);
        const startTime = new Date().getTime();
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        const dashboardCharts = await this.getDashboardChartsResults(
            user,
            dashboard,
        );
        const timeGetCharts = new Date().getTime() - startTime;

        const chartSummaries = dashboardCharts.map(async (chartData) => {
            const { result, tokenUsage } = await this.createChartSummary(
                chartData,
            );

            return {
                chartName: chartData.name,
                tokenUsage,
                summary: result,
            };
        });

        let chartSummaryResults;

        try {
            chartSummaryResults = await Promise.all(chartSummaries);
        } catch (e) {
            const errorCode =
                e instanceof Error && 'code' in e ? e.code : getErrorMessage(e);
            throw new Error(`Failed to generate summary - ${errorCode}`);
        }

        let dashboardSummaryResult;
        const formattedSummaries = formatSummaryArray(chartSummaryResults);
        const { context, tone, audiences } = opts;

        try {
            dashboardSummaryResult = await this.openAi.run(
                DEFAULT_DASHBOARD_SUMMARY_PROMPT,
                {
                    chart_summaries: formattedSummaries,
                    context: context ?? '',
                    audiences: audiences.join(', '),
                    tone,
                },
            );
        } catch (e) {
            const errorCode =
                e instanceof Error && 'code' in e ? e.code : getErrorMessage(e);
            throw new Error(`Failed to generate summary - ${errorCode}`);
        }

        const {
            result: dashboardSummaryText,
            tokenUsage: dashboardSummaryTokenUsage,
        } = dashboardSummaryResult;

        const timeOpenAi = new Date().getTime() - startTime - timeGetCharts;

        const dashboardSummary = await this.dashboardSummaryModel.save(
            dashboardUuid,
            dashboard.dashboardVersionId,
            dashboardSummaryText,
            tone,
            audiences,
            context,
        );

        const chartSummariesTokenUsage = chartSummaryResults.map(
            (cs) => cs.tokenUsage,
        );

        const totalTokenUsages = [
            dashboardSummaryTokenUsage,
            ...chartSummariesTokenUsage,
        ].filter((t): t is TokenUsage => t !== undefined);

        const totalTokens = getTotalTokenUsage(totalTokenUsages);

        if (this.openAi.model === undefined) {
            throw new UnexpectedServerError('OpenAi model is not initialized');
        }
        this.analytics.track<DashboardSummaryCreated>({
            userId: user.userUuid,
            event: 'ai.dashboard_summary.executed',
            properties: {
                openAIModelName: this.openAi.model.modelName,
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                dashboardId: dashboardUuid,
                dashboardSummaryUuid: dashboardSummary.dashboardSummaryUuid,
                context,
                responseSize: dashboardSummaryText.length,
                tokenUsage: totalTokens,
                timeGetCharts,
                timeOpenAi,
                timeTotal: timeOpenAi + timeGetCharts,
            },
        });

        return dashboardSummary;
    }

    // TODO: user permissions
    async getDashboardSummary(
        user: SessionUser,
        projectUuid: string,
        dashboardUuid: string,
    ) {
        await AiService.throwOnFeatureDisabled(user);
        const dashboardSummary =
            await this.dashboardSummaryModel.getByDashboardUuid(dashboardUuid);

        this.analytics.track<DashboardSummaryViewed>({
            userId: user.userUuid,
            event: 'ai.dashboard_summary.viewed',
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                dashboardId: dashboardUuid,
                dashboardSummaryUuid: dashboardSummary.dashboardSummaryUuid,
            },
        });

        return dashboardSummary;
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
            if (!this.openAi.embedder) {
                throw new UnexpectedServerError(
                    'OpenAi embedder is not initialized',
                );
            }
            const embedQueries = await this.openAi.embedder.embedDocuments(
                embeddingSearchQueries.map((q) => JSON.stringify(q)),
            );

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
                ? await this.aiModel.findSlackPrompt(prompt.promptUuid)
                : await this.aiModel.findWebAppPrompt(prompt.promptUuid);

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

        return {
            getExplore,
            searchFields: this.lightdashConfig.ai.copilot.embeddingSearchEnabled
                ? searchFields
                : undefined,
            updateProgress,
            getPrompt,
            runMiniMetricQuery,
            sendFile,
        };
    }

    async generateExploreResult(
        user: SessionUser,
        messageHistory: CoreMessage[],
        slackOrWebAppPrompt: SlackPrompt | AiWebAppPrompt,
    ): Promise<string> {
        if (!user.organizationUuid) {
            throw new Error('Organization not found');
        }

        if (!(await this.getIsCopilotEnabled(user))) {
            throw new Error('AI Copilot is not enabled');
        }

        // TODO: add to lightdash config
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key not found');
        }

        const { projectUuid } = slackOrWebAppPrompt;

        const agentSettings =
            'slackChannelId' in slackOrWebAppPrompt
                ? await this.aiAgentModel.getAgentBySlackChannelId({
                      organizationUuid: user.organizationUuid,
                      slackChannelId: slackOrWebAppPrompt.slackChannelId,
                  })
                : await this.aiAgentModel.getAgent({
                      organizationUuid: slackOrWebAppPrompt.organizationUuid,
                      agentUuid: slackOrWebAppPrompt.agentUuid!,
                  });

        const {
            getExplore,
            searchFields,
            updateProgress,
            getPrompt,
            runMiniMetricQuery,
            sendFile,
        } = this.getAiAgentDependencies(
            user,
            slackOrWebAppPrompt,
            agentSettings?.tags ?? null,
        );

        const aiAgentExploreSummaries = await this.getMinimalExploreInformation(
            user,
            projectUuid,
            agentSettings?.tags ?? null,
        );

        return runAgent({
            args: {
                openaiApiKey: process.env.OPENAI_API_KEY,
                agentName: agentSettings.name,
                instruction: agentSettings.instruction,
                messageHistory,
                aiAgentExploreSummaries,
                promptUuid: slackOrWebAppPrompt.promptUuid,
                maxLimit: this.lightdashConfig.query.maxLimit,
            },
            dependencies: {
                getExplore,
                searchFields,
                runMiniMetricQuery,
                getPrompt,
                sendFile,
                // avoid binding
                updateProgress: (args) => updateProgress(args),
                updatePrompt: (args) => this.aiModel.updateModelResponse(args),
            },
        });
    }

    // TODO: user permissions
    async updateHumanScoreForPrompt(promptUuid: string, humanScore: number) {
        await this.aiModel.updateHumanScore({
            promptUuid,
            humanScore,
        });
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
    }): Promise<[string, boolean]> {
        let createdThread = false;
        let threadUuid: string | undefined;

        const slackPromptExists =
            await this.aiModel.existsSlackPromptByChannelIdAndPromptTs(
                data.slackChannelId,
                data.promptSlackTs,
            );

        // This happens in the case of updating a prompt message in slack
        if (slackPromptExists) {
            throw new AiDuplicateSlackPromptError('Prompt already exists');
        }

        if (data.slackThreadTs) {
            threadUuid =
                await this.aiModel.findThreadUuidBySlackChannelIdAndThreadTs(
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
            threadUuid = await this.aiModel.createSlackThread({
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

        const slackTagRegex = /^.*?(<@U\d+\w*?>)/g;

        const uuid = await this.aiModel.createSlackPrompt({
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
        let slackPrompt = await this.aiModel.findSlackPrompt(promptUuid);
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

        const threadMessages = await this.aiModel.getThreadMessages(
            slackPrompt.organizationUuid,
            slackPrompt.projectUuid,
            slackPrompt.threadUuid,
        );

        const thread = await this.aiModel.findThread(slackPrompt.threadUuid);
        if (!thread) {
            throw new Error('Thread not found');
        }

        let name: string | undefined;
        if (thread.agentUuid) {
            const agent = await this.aiAgentService.getAgent(
                user,
                thread.agentUuid,
            );

            name = agent.name;
        }

        let response: string | undefined;
        try {
            const chatHistoryMessages =
                getChatHistoryFromThreadMessages(threadMessages);

            response = await this.generateExploreResult(
                user,
                chatHistoryMessages,
                slackPrompt,
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
        slackPrompt = await this.aiModel.findSlackPrompt(promptUuid);

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

        await this.aiModel.updateModelResponse({
            promptUuid: slackPrompt.promptUuid,
            response,
        });

        if (newResponse.ts) {
            await this.aiModel.updateSlackResponseTs({
                promptUuid: slackPrompt.promptUuid,
                responseSlackTs: newResponse.ts,
            });
        }
    }

    async generateAgentThreadResponse(
        agentUuid: string,
        threadUuid: string,
        promptUuid: string,
    ): Promise<void> {
        const thread = await this.aiModel.findThread(threadUuid);
        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }

        const prompt = await this.aiModel.findWebAppPrompt(promptUuid);
        if (!prompt) {
            throw new NotFoundError(`Prompt not found: ${promptUuid}`);
        }

        const { organizationUuid, projectUuid } = thread;

        const threadMessages = await this.aiModel.getThreadMessages(
            organizationUuid,
            projectUuid,
            threadUuid,
        );

        if (threadMessages.length === 0) {
            throw new Error(
                `No messages found in thread: ${threadUuid}. ${agentUuid} ${promptUuid}`,
            );
        }

        const user = await this.userModel.findSessionUserAndOrgByUuid(
            prompt.createdByUserUuid,
            organizationUuid,
        );

        try {
            const chatHistoryMessages =
                getChatHistoryFromThreadMessages(threadMessages);

            // TODO: when we move this method to `aiAgentService` we can move the `generateAgentThreadResponse` too
            const response = await this.generateExploreResult(
                user,
                chatHistoryMessages,
                prompt,
            );

            await this.aiModel.updateWebAppResponse({
                promptUuid,
                response,
            });
        } catch (e) {
            Logger.error('Failed to generate agent thread response:', e);
            throw new Error('Failed to generate agent thread response');
        }
    }

    async getConversations(
        user: SessionUser,
        projectUuid: string,
    ): Promise<AiConversation[]> {
        if (!(await this.getIsCopilotEnabled(user))) {
            throw new Error('AI Copilot is not enabled');
        }

        const projectSummary = await this.projectModel.getSummary(projectUuid);

        const canViewProject = user.ability.can(
            'view',
            subject('Project', {
                organizationUuid: projectSummary.organizationUuid,
                projectUuid,
            }),
        );

        if (!canViewProject) {
            throw new Error('User does not have access to the project!');
        }

        if (!user.organizationUuid) {
            throw new Error('Organization not found');
        }

        const threads = await this.aiModel.getThreads(
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

        const messages = await this.aiModel.getThreadMessages(
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

        const threadUuid = await this.aiModel.createWebAppThread({
            organizationUuid: user.organizationUuid,
            projectUuid,
            userUuid: user.userUuid,
            createdFrom: 'web_app',
            agentUuid: null,
        });

        if (threadUuid === undefined) {
            throw new Error('Failed to create web app thread');
        }

        const promptUuid = await this.aiModel.createWebAppPrompt({
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

        await this.aiModel.createWebAppThread({
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

        const webAppPrompt = await this.aiModel.findWebAppPrompt(promptUuid);

        if (!webAppPrompt) {
            throw new Error('Prompt not found');
        }

        const response = await this.generateExploreResult(
            user,
            [{ role: 'user', content: question }],
            webAppPrompt,
        );

        await this.aiModel.updateWebAppResponse({
            promptUuid: webAppPrompt.promptUuid,
            response,
        });

        const finalPrompt = await this.aiModel.findWebAppPrompt(promptUuid);

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
}
