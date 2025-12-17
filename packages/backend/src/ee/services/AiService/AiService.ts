import { type TokenUsage } from '@langchain/core/language_models/base';
import {
    CommercialFeatureFlags,
    DashboardDAO,
    DashboardSummary,
    FeatureFlags,
    ForbiddenError,
    GenerateChartMetadataRequest,
    GeneratedChartMetadata,
    ItemsMap,
    QueryExecutionContext,
    SessionUser,
    UnexpectedServerError,
    getErrorMessage,
    getItemId,
    isDashboardChartTileType,
    isField,
} from '@lightdash/common';
import { LanguageModel } from 'ai';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { fromSession } from '../../../auth/account';
import { LightdashConfig } from '../../../config/parseConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { isFeatureFlagEnabled } from '../../../postHog';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import {
    CustomVizGenerated,
    DashboardSummaryCreated,
    DashboardSummaryViewed,
    GenerateChartMetadataGenerated,
} from '../../analytics';
import OpenAi from '../../clients/OpenAi';
import { DashboardSummaryModel } from '../../models/DashboardSummaryModel';
import { generateChartMetadata as generateChartMetadataFromContext } from '../ai/agents/chartMetadataGenerator';
import { getModel } from '../ai/models';
import { getAnthropicModel } from '../ai/models/anthropic-claude';
import { getModelPreset } from '../ai/models/presets';
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
    projectService: ProjectService;
    openAi: OpenAi;
    lightdashConfig: LightdashConfig;
    featureFlagService: FeatureFlagService;
};

export class AiService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly dashboardModel: DashboardModel;

    private readonly dashboardSummaryModel: DashboardSummaryModel;

    private readonly projectService: ProjectService;

    private readonly openAi: OpenAi;

    private readonly featureFlagService: FeatureFlagService;

    constructor(dependencies: Dependencies) {
        this.analytics = dependencies.analytics;
        this.dashboardModel = dependencies.dashboardModel;
        this.dashboardSummaryModel = dependencies.dashboardSummaryModel;
        this.projectService = dependencies.projectService;
        this.openAi = dependencies.openAi;
        this.lightdashConfig = dependencies.lightdashConfig;
        this.featureFlagService = dependencies.featureFlagService;
    }

    /**
     * Gets a language model for ambient AI tasks.
     * 1. Checks anthropic shared key
     * 2. Falls back to AI Copilot if the feature flag is enabled for the user,
     *    using their configured model.
     *
     * @returns The language model
     */
    private async getAmbientAiModel(user: SessionUser): Promise<LanguageModel> {
        const anthropicConfig =
            this.lightdashConfig.ai.copilot.providers.anthropic;

        if (anthropicConfig?.apiKey) {
            const preset = getModelPreset('anthropic', 'claude-haiku-4-5');
            if (!preset) {
                throw new UnexpectedServerError(
                    'claude-haiku-4-5 preset not found',
                );
            }
            const aiModel = getAnthropicModel(anthropicConfig, preset, {
                enableReasoning: false,
            });
            return aiModel.model;
        }

        const aiCopilotFlag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });

        if (!aiCopilotFlag.enabled) {
            throw new ForbiddenError('Ambient AI is not available');
        }

        const aiModel = getModel(this.lightdashConfig.ai.copilot, {
            enableReasoning: false,
            useFastModel: true,
        });
        return aiModel.model;
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
                    account: fromSession(user),
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
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );
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
            dashboard.uuid,
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
        dashboardUuidOrSlug: string,
    ) {
        await AiService.throwOnFeatureDisabled(user);

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
        );
        const dashboardSummary =
            await this.dashboardSummaryModel.getByDashboardUuid(dashboard.uuid);

        this.analytics.track<DashboardSummaryViewed>({
            userId: user.userUuid,
            event: 'ai.dashboard_summary.viewed',
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                dashboardId: dashboard.uuid,
                dashboardSummaryUuid: dashboardSummary.dashboardSummaryUuid,
            },
        });

        return dashboardSummary;
    }

    async generateChartMetadata(
        user: SessionUser,
        projectUuid: string,
        payload: GenerateChartMetadataRequest,
    ): Promise<GeneratedChartMetadata> {
        const model = await this.getAmbientAiModel(user);

        const result = await generateChartMetadataFromContext(model, {
            tableName: payload.tableName,
            chartType: payload.chartType,
            dimensions: payload.dimensions,
            metrics: payload.metrics,
            filters: payload.filters,
            fieldsContext: payload.fieldsContext,
            chartConfigJson: payload.chartConfigJson,
        });

        this.analytics.track<GenerateChartMetadataGenerated>({
            userId: user.userUuid,
            event: 'ai.chart_metadata.generated',
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                chartType: payload.chartType,
            },
        });

        return result;
    }
}
