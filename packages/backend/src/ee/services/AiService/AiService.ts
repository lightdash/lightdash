import { subject } from '@casl/ability';
import { type TokenUsage } from '@langchain/core/language_models/base';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { OutputParserException } from '@langchain/core/output_parsers';
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from '@langchain/core/prompts';
import {
    AiChatAgents,
    AiChatMessage,
    AiConversation,
    AiConversationMessage,
    AiWebAppPrompt,
    AnyType,
    CatalogType,
    CommercialFeatureFlags,
    DashboardDAO,
    DashboardSummary,
    FeatureFlags,
    ItemsMap,
    LightdashUser,
    QueryExecutionContext,
    SessionUser,
    SlackPrompt,
    UnexpectedServerError,
    assertUnreachable,
    filterExploreByTags,
    getErrorMessage,
    getItemId,
    isDashboardChartTileType,
    isField,
    isSlackPrompt,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { AgentExecutor } from 'langchain/agents';
import { pick } from 'lodash';
import moment from 'moment';
import slackifyMarkdown from 'slackify-markdown';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { PostSlackFile, SlackClient } from '../../../clients/Slack/SlackClient';
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
import type { CommercialSlackAuthenticationModel } from '../../models/CommercialSlackAuthenticationModel';
import { DashboardSummaryModel } from '../../models/DashboardSummaryModel';
import { AiAgentService } from '../AiAgentService';
import { CommercialCatalogService } from '../CommercialCatalogService';
import { MiniMetricQuery } from './runMiniMetricQuery/runMiniMetricQuery';
import { getFindFieldsTool } from './tools/findFieldsTool';
import { getGenerateBarVizConfigTool } from './tools/generateBarVizConfigTool';
import { getGenerateCsvTool } from './tools/generateCsvTool';
import { getGenerateQueryFiltersTool } from './tools/generateQueryFilters';
import { getGenerateTimeSeriesVizConfigTool } from './tools/generateTimeSeriesVizConfigTool';
import { getGetOneLineResultTool } from './tools/getOneLineResult';
import {
    getDeepLinkBlocks,
    getExploreBlocks,
    getFeedbackBlocks,
    getFollowUpToolBlocks,
} from './utils/aiCopilot/getSlackBlocks';
import { aiCopilotSystemPrompt } from './utils/aiCopilot/prompts';
import { validateSelectedFieldsExistence } from './utils/aiCopilot/validators';
import { AiDuplicateSlackPromptError } from './utils/errors';
import { createOpenAIToolsAgent } from './utils/langchainUtils';
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
    ) {
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
    private getToolUtilities(
        user: SessionUser,
        prompt: SlackPrompt | AiWebAppPrompt,
        availableTags: string[] | null,
    ) {
        const { projectUuid, organizationUuid } = prompt;

        const getExplore = async ({ exploreName }: { exploreName: string }) => {
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
                throw new Error('Explore not found');
            }

            return filteredExplore;
        };

        const searchFields = this.lightdashConfig.ai.copilot
            .embeddingSearchEnabled
            ? async ({
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
                  const embedQueries =
                      await this.openAi.embedder.embedDocuments(
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
              }
            : undefined;

        const updateProgress = (progress: string) =>
            isSlackPrompt(prompt)
                ? this.updateSlackResponseWithProgress(prompt, progress)
                : Promise.resolve();

        const getPrompt = async () => {
            const webOrSlackPrompt = isSlackPrompt(prompt)
                ? await this.aiModel.findSlackPrompt(prompt.promptUuid)
                : await this.aiModel.findWebAppPrompt(prompt.promptUuid);

            if (!webOrSlackPrompt) {
                throw new Error('Prompt not found');
            }
            return webOrSlackPrompt;
        };

        const runMiniMetricQuery = async (metricQuery: MiniMetricQuery) => {
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

        const sendFile = async (args: PostSlackFile) => {
            await this.slackClient.postFileToThread(args);
        };

        return {
            getExplore,
            searchFields,
            updateProgress,
            getPrompt,
            runMiniMetricQuery,
            sendFile,
        };
    }

    async generateExploreResult(
        user: SessionUser,
        prevMessages: AiChatMessage[],
        slackOrWebAppPrompt: SlackPrompt | AiWebAppPrompt,
    ): Promise<string> {
        if (!user.organizationUuid) {
            throw new Error('Organization not found');
        }

        if (!(await this.getIsCopilotEnabled(user))) {
            throw new Error('AI Copilot is not enabled');
        }

        const { projectUuid } = slackOrWebAppPrompt;

        const agentSettings =
            'slackChannelId' in slackOrWebAppPrompt
                ? await this.aiAgentModel.getAgentBySlackChannelId({
                      organizationUuid: user.organizationUuid,
                      slackChannelId: slackOrWebAppPrompt.slackChannelId,
                  })
                : undefined;

        const {
            getExplore,
            searchFields,
            updateProgress,
            getPrompt,
            runMiniMetricQuery,
            sendFile,
        } = this.getToolUtilities(
            user,
            slackOrWebAppPrompt,
            agentSettings?.tags ?? null,
        );

        const findFieldsTool = getFindFieldsTool({
            getExplore,
            searchFields,
        });

        const generateQueryFilters = getGenerateQueryFiltersTool({
            getExplore,
            promptUuid: slackOrWebAppPrompt.promptUuid,
            updatePrompt: this.aiModel.updateSlackResponse.bind(this.aiModel),
        });

        const generateBarVizConfigTool = getGenerateBarVizConfigTool({
            updateProgress: updateProgress.bind(this),
            runMiniMetricQuery,
            getPrompt,
            updatePrompt: this.aiModel.updateSlackResponse.bind(this.aiModel),
            sendFile,
        });

        const generateTimeSeriesVizConfigTool =
            getGenerateTimeSeriesVizConfigTool({
                updateProgress: updateProgress.bind(this),
                runMiniMetricQuery,
                getPrompt,
                updatePrompt: this.aiModel.updateSlackResponse.bind(
                    this.aiModel,
                ),
                sendFile,
            });

        const generateCsvTool = getGenerateCsvTool({
            updateProgress: updateProgress.bind(this),
            runMiniMetricQuery,
            getPrompt,
            updatePrompt: this.aiModel.updateSlackResponse.bind(this.aiModel),
            sendFile,
            maxLimit: this.lightdashConfig.query.maxLimit,
        });

        const getOneLineResultTool = getGetOneLineResultTool({
            updateProgress: updateProgress.bind(this),
            runMiniMetricQuery,
            getPrompt,
            updatePrompt: this.aiModel.updateSlackResponse.bind(this.aiModel),
        });

        const tools = [
            findFieldsTool,
            generateQueryFilters,
            generateBarVizConfigTool,
            generateCsvTool,
            generateTimeSeriesVizConfigTool,
            getOneLineResultTool,
        ];

        const llm = this.openAi.model;
        if (llm === undefined) {
            throw new UnexpectedServerError('OpenAi model is not initialized');
        }
        const prompt = ChatPromptTemplate.fromMessages([
            aiCopilotSystemPrompt,
            new MessagesPlaceholder('metadata'),
            new MessagesPlaceholder('chat_history'),
            new MessagesPlaceholder('agent_scratchpad'),
        ]);

        const agent = await createOpenAIToolsAgent({
            llm,
            prompt,
            tools,
            streamRunnable: false,
            // TODO: enable this when we have a way to have openai compliant zod/json schemas
            // strict: true,
        });

        const agentExecutor = new AgentExecutor({
            agent,
            tools,
            returnIntermediateSteps: true,
            handleParsingErrors(e) {
                Logger.debug('Failed to parse the output:', e);
                Sentry.captureException(e);
                const isOutputParserException =
                    e instanceof OutputParserException;
                const parseItem = isOutputParserException
                    ? 'output'
                    : `tool input`;

                return `Failed to parse the ${parseItem}.

Here's the original error message: ${e.message}

${
    isOutputParserException && e.llmOutput
        ? `Here's the output that caused the error:

\`\`\`
${e.llmOutput}
\`\`\``
        : ''
}
`;
            },
            // make sure to set the maxIterations to a reasonable number based on the tool's complexity
            maxIterations: 10,
        });

        const chatHistory = prevMessages.map(
            ({ agent: agentType, message }) => {
                switch (agentType) {
                    case AiChatAgents.AI:
                        return new AIMessage(message);
                    case AiChatAgents.HUMAN:
                        return new HumanMessage(message);
                    default:
                        return assertUnreachable(
                            agentType,
                            `unknown agent: ${agent}`,
                        );
                }
            },
        );

        const minimalExploreInformation =
            await this.getMinimalExploreInformation(
                user,
                projectUuid,
                agentSettings?.tags ?? null,
            );

        const results = await agentExecutor.invoke({
            chat_history: chatHistory,
            metadata: [
                new HumanMessage({
                    content: JSON.stringify(minimalExploreInformation, null, 2),
                    name: 'available_explores_json',
                }),
            ],
            date: moment().utc().format('YYYY-MM-DD'),
            time: moment().utc().format('HH:mm'),
        });

        // console.debug('~~~~~~~~~~~~~~~');
        // console.debug(util.inspect(results, { depth: null, colors: true }));
        // console.debug('~~~~~~~~~~~~~~~');

        return results.output;
    }

    // TODO: user permissions
    async updateHumanScoreForPrompt(promptUuid: string, humanScore: number) {
        await this.aiModel.updateSlackResponse({
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

    private getChatHistoryFromThreadMessages(
        threadMessages: Awaited<
            ReturnType<typeof this.aiModel.getThreadMessages>
        >,
    ) {
        return threadMessages.flatMap<AiChatMessage>((message) => {
            const hasExtraContext =
                message.viz_config_output ||
                message.filters_output ||
                message.filters_output ||
                message.metric_query;

            return [
                { agent: AiChatAgents.HUMAN, message: message.prompt },
                ...(hasExtraContext
                    ? [
                          {
                              agent: AiChatAgents.HUMAN,
                              message: `Here's some context for your response:

${
    message.viz_config_output
        ? `Viz Config: ${JSON.stringify(message.viz_config_output)}`
        : ''
}

${
    message.filters_output
        ? `Filters: ${JSON.stringify(message.filters_output)}`
        : ''
}

${
    message.metric_query
        ? `Metric Query: ${JSON.stringify(message.metric_query)}`
        : ''
}

${
    message.human_score
        ? `Human Score: ${
              // eslint-disable-next-line no-nested-ternary
              message.human_score === 1
                  ? 'Positive'
                  : message.human_score === -1
                  ? 'Negative'
                  : 'Neutral'
          }`
        : ''
}`,
                          },
                      ]
                    : []),
                ...(message.response
                    ? [
                          {
                              agent: AiChatAgents.AI,
                              message: message.response,
                          },
                      ]
                    : []),
            ];
        });
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

        let response: string | undefined;
        try {
            const threadMessages = await this.aiModel.getThreadMessages(
                slackPrompt.organizationUuid,
                slackPrompt.projectUuid,
                slackPrompt.threadUuid,
            );

            const chatHistoryMessages =
                this.getChatHistoryFromThreadMessages(threadMessages);

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

        await this.aiModel.updateSlackResponse({
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
            [
                {
                    agent: AiChatAgents.HUMAN,
                    message: question,
                },
            ],
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
        const utils = this.getToolUtilities(user, finalPrompt, null);

        const rows = finalPrompt.metricQuery
            ? (
                  await utils.runMiniMetricQuery(
                      finalPrompt.metricQuery as MiniMetricQuery,
                  )
              ).rows
            : undefined;

        return {
            prompt: finalPrompt,
            rows,
        };
    }
}
