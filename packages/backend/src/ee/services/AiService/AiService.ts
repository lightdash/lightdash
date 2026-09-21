import { subject } from '@casl/ability';
import { type TokenUsage } from '@langchain/core/language_models/base';
import {
    CommercialFeatureFlags,
    FeatureFlags,
    ForbiddenError,
    GenerateChartMetadataRequest,
    GenerateCustomDimensionRequest,
    GeneratedChartMetadata,
    GeneratedCustomDimension,
    GeneratedFormulaTableCalculation,
    GeneratedTableCalculation,
    GeneratedTooltip,
    GenerateFormulaTableCalculationRequest,
    GenerateTableCalculationRequest,
    GenerateTooltipRequest,
    getErrorMessage,
    getItemId,
    isField,
    ItemsMap,
    ParameterError,
    QueryExecutionContext,
    SessionUser,
    SuggestChartTypeDataRequest,
    SuggestedChartTypeData,
    TableCalculationType,
    UnexpectedServerError,
    type ChartTypeDataAlternative,
    type Explore,
} from '@lightdash/common';
import { generateText } from 'ai';
import NodeCache from 'node-cache';
import { createHash } from 'node:crypto';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { fromSession } from '../../../auth/account';
import { LightdashConfig } from '../../../config/parseConfig';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import { BaseService } from '../../../services/BaseService';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import {
    ChartTypeDataSuggested,
    ConvertSqlToFormulaGenerated,
    CustomVizGenerated,
    GenerateChartMetadataGenerated,
    GenerateCustomDimensionGenerated,
    GenerateFormulaTableCalculationGenerated,
    GenerateTableCalculationGenerated,
    GenerateTooltipGenerated,
} from '../../analytics';
import OpenAi from '../../clients/OpenAi';
import { generateChartMetadata as generateChartMetadataFromContext } from '../ai/agents/chartMetadataGenerator';
import {
    compareChartQueries,
    type ChartSimilarityInput,
    type ChartSimilarityMatch,
} from '../ai/agents/chartSimilarity';
import {
    buildFieldRanking,
    CHART_TYPE_DATA_CAPS,
    suggestChartTypeData as suggestChartTypeDataFromContext,
    truncate,
    validateChartTypeDataSuggestion,
    type AlternativeExploreCandidate,
} from '../ai/agents/chartTypeDataSuggester';
import { generateCustomDimension as generateCustomDimensionFromContext } from '../ai/agents/customDimensionGenerator';
import {
    detectDataAppAnomalies,
    type DataAppDetection,
} from '../ai/agents/dataAppAnomalyDetector';
import { answerDataAppPrompt } from '../ai/agents/dataAppPromptAnswerer';
import {
    generateFormulaTableCalculation as generateFormulaTableCalculationFromContext,
    sanitizeCustomFormat as sanitizeFormulaCustomFormat,
} from '../ai/agents/formulaTableCalculationGenerator';
import {
    generateTableCalculation as generateTableCalculationFromContext,
    sanitizeCustomFormat,
} from '../ai/agents/tableCalculationGenerator';
import { generateTooltip as generateTooltipFromContext } from '../ai/agents/tooltipGenerator';
import {
    getModel,
    pickAmbientAnthropicPreset,
    resolveKeyManagement,
} from '../ai/models';
import { getAnthropicModel } from '../ai/models/anthropic-claude';
import { OrgAiCopilotConfigResolver } from '../ai/OrgAiCopilotConfigResolver';
import {
    AiCallAttribution,
    getGeneratorTelemetry,
    getLanguageModelAttribution,
} from '../ai/utils/aiCallTelemetry';
import { type AiAgentToolsService } from '../AiAgentToolsService/AiAgentToolsService';
import { DEFAULT_CUSTOM_VIZ_PROMPT } from './utils/prompts';
import { getTotalTokenUsage } from './utils/tokens';

type Dependencies = {
    analytics: LightdashAnalytics;
    projectService: ProjectService;
    openAi: OpenAi;
    lightdashConfig: LightdashConfig;
    featureFlagService: FeatureFlagService;
    orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;
    // Resolved lazily: the tools service is built from services that reach
    // back into this one.
    getAiAgentToolsService: () => AiAgentToolsService;
};

const NO_MATCHING_EXPLORE_REASON =
    'No explore in this project matches that description.';
const NO_ACCESSIBLE_EXPLORE_REASON =
    'No explore you can access matches that description.';
const NO_CHOSEN_EXPLORE_REASON =
    'Could not settle on an explore for that description. Try naming the data you want.';

export class AiService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectService: ProjectService;

    private readonly openAi: OpenAi;

    private readonly featureFlagService: FeatureFlagService;

    private readonly orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;

    private readonly getAiAgentToolsService: () => AiAgentToolsService;

    private readonly chartSimilarityCache = new NodeCache({
        stdTTL: 60,
        checkperiod: 60,
        maxKeys: 100,
    });

    private readonly chartSimilarityInFlight = new Map<
        string,
        Promise<ChartSimilarityMatch[]>
    >();

    async isAmbientAiEnabled(user: SessionUser): Promise<boolean> {
        try {
            const config =
                await this.orgAiCopilotConfigResolver.getCopilotConfig(
                    user.organizationUuid ?? null,
                );
            // Configuration only: cached review submissions must not contact providers.
            if (config.providers.anthropic?.apiKey) return true;
            const flag = await this.featureFlagService.get({
                user,
                featureFlagId: CommercialFeatureFlags.AiCopilot,
            });
            if (!flag.enabled) return false;
            getModel(config, { enableReasoning: false, useFastModel: true });
            return true;
        } catch {
            return false;
        }
    }

    // Caller supplies freshly authorized chart definitions. Keys include the
    // caller and complete query context, so revisions and permissions are re-read.
    async compareCharts(
        user: SessionUser,
        projectUuid: string,
        input: ChartSimilarityInput,
        cachedOnly = false,
    ): Promise<ChartSimilarityMatch[] | undefined> {
        const key = createHash('sha256')
            .update(
                JSON.stringify([
                    user.organizationUuid,
                    user.userUuid,
                    projectUuid,
                    input,
                ]),
            )
            .digest('hex');
        const cached =
            this.chartSimilarityCache.get<ChartSimilarityMatch[]>(key);
        if (cached !== undefined || cachedOnly) return cached;
        const inFlight = this.chartSimilarityInFlight.get(key);
        if (inFlight) return inFlight;
        // Bound concurrent work as well as context and model output.
        if (this.chartSimilarityInFlight.size >= 20) return undefined;
        const operation = (async () => {
            const model = await this.getAmbientAiModel(user, { projectUuid });
            const matches = await compareChartQueries(model, input);
            if (this.chartSimilarityCache.getStats().keys < 100) {
                this.chartSimilarityCache.set(key, matches);
            }
            return matches;
        })();
        this.chartSimilarityInFlight.set(key, operation);
        try {
            return await operation;
        } finally {
            this.chartSimilarityInFlight.delete(key);
        }
    }

    constructor(dependencies: Dependencies) {
        super();
        this.analytics = dependencies.analytics;
        this.projectService = dependencies.projectService;
        this.openAi = dependencies.openAi;
        this.lightdashConfig = dependencies.lightdashConfig;
        this.featureFlagService = dependencies.featureFlagService;
        this.orgAiCopilotConfigResolver =
            dependencies.orgAiCopilotConfigResolver;
        this.getAiAgentToolsService = dependencies.getAiAgentToolsService;
    }

    /**
     * Gets a language model for ambient AI tasks.
     * 1. Checks anthropic shared key
     * 2. Falls back to AI Copilot if the feature flag is enabled for the user,
     *    using their configured model.
     *
     * @returns The full AiModel with model, callOptions, and providerOptions
     */
    private async getAmbientAiModel(
        user: SessionUser,
        telemetry?: { projectUuid?: string | null },
    ) {
        const attribution: AiCallAttribution = {
            organizationUuid: user.organizationUuid ?? null,
            userUuid: user.userUuid,
            projectUuid: telemetry?.projectUuid ?? null,
        };

        const copilotConfig =
            await this.orgAiCopilotConfigResolver.getCopilotConfig(
                user.organizationUuid ?? null,
            );

        const anthropicConfig = copilotConfig.providers.anthropic;

        if (anthropicConfig?.apiKey) {
            // Prefer the fast model, but a BYO key may not have access to it
            // (e.g. a key that only unlocks claude-opus-4-8). Fall back to a
            // model the key can actually serve rather than failing at runtime.
            const accessibleModelIds =
                await this.orgAiCopilotConfigResolver.getAccessibleModelIds(
                    'anthropic',
                    anthropicConfig.apiKey,
                    {
                        baseUrl: anthropicConfig.baseUrl,
                        availableModels: anthropicConfig.availableModels,
                        customHeaders: anthropicConfig.customHeaders,
                    },
                );
            const preset = pickAmbientAnthropicPreset(accessibleModelIds);
            if (!preset) {
                throw new ForbiddenError(
                    "Ambient AI is unavailable: your Anthropic API key can't access a supported model.",
                );
            }
            return {
                ...getAnthropicModel(anthropicConfig, preset, {
                    enableReasoning: false,
                }),
                // getAnthropicModel does not use getModel and withKeyManagement.
                // Set keyManagement here. If you do not, the ambient calls
                // record a null key origin.
                keyManagement: resolveKeyManagement(copilotConfig, 'anthropic'),
                telemetry: attribution,
            };
        }

        const aiCopilotFlag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });

        if (!aiCopilotFlag.enabled) {
            throw new ForbiddenError('Ambient AI is not available');
        }

        return {
            ...getModel(copilotConfig, {
                enableReasoning: false,
                useFastModel: true,
            }),
            telemetry: attribution,
        };
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
        const project = await this.projectService.getProject(
            projectUuid,
            fromSession(user),
        );
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('Explore', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const aiCustomVizFlag = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.AiCustomViz,
        });

        if (!aiCustomVizFlag.enabled) {
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

    async generateChartMetadata(
        user: SessionUser,
        projectUuid: string,
        payload: GenerateChartMetadataRequest,
    ): Promise<GeneratedChartMetadata> {
        const project = await this.projectService.getProject(
            projectUuid,
            fromSession(user),
        );
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('Explore', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const modelOptions = await this.getAmbientAiModel(user, {
            projectUuid,
        });

        const result = await generateChartMetadataFromContext(modelOptions, {
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

    async generateTableCalculation(
        user: SessionUser,
        projectUuid: string,
        payload: GenerateTableCalculationRequest,
    ): Promise<GeneratedTableCalculation> {
        const project = await this.projectService.getProject(
            projectUuid,
            fromSession(user),
        );
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('CustomSqlTableCalculations', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const modelOptions = await this.getAmbientAiModel(user, {
            projectUuid,
        });
        const warehouseType = project.warehouseConnection?.type;

        if (!warehouseType) {
            throw new ForbiddenError('Warehouse type is not available');
        }

        const result = await generateTableCalculationFromContext(modelOptions, {
            prompt: payload.prompt,
            tableName: payload.tableName,
            warehouseType,
            fieldsContext: payload.fieldsContext,
            existingTableCalculations: payload.existingTableCalculations,
            currentSql: payload.currentSql,
        });

        this.analytics.track<GenerateTableCalculationGenerated>({
            userId: user.userUuid,
            event: 'ai.table_calculation.generated',
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                userId: user.userUuid,
            },
        });

        return {
            sql: result.sql,
            displayName: result.displayName,
            type: result.type as TableCalculationType,
            format: sanitizeCustomFormat(result.format ?? undefined),
        };
    }

    async generateCustomDimension(
        user: SessionUser,
        projectUuid: string,
        payload: GenerateCustomDimensionRequest,
    ): Promise<GeneratedCustomDimension> {
        const project = await this.projectService.getProject(
            projectUuid,
            fromSession(user),
        );
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('CustomFields', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const modelOptions = await this.getAmbientAiModel(user, {
            projectUuid,
        });
        const warehouseType = project.warehouseConnection?.type;

        if (!warehouseType) {
            throw new ForbiddenError('Warehouse type is not available');
        }

        const result = await generateCustomDimensionFromContext(modelOptions, {
            ...payload,
            warehouseType,
        });

        this.analytics.track<GenerateCustomDimensionGenerated>({
            userId: user.userUuid,
            event: 'ai.custom_dimension.generated',
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                userId: user.userUuid,
            },
        });

        return result;
    }

    async generateFormulaTableCalculation(
        user: SessionUser,
        projectUuid: string,
        payload: GenerateFormulaTableCalculationRequest,
    ): Promise<GeneratedFormulaTableCalculation> {
        const project = await this.projectService.getProject(
            projectUuid,
            fromSession(user),
        );
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('Explore', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const modelOptions = await this.getAmbientAiModel(user, {
            projectUuid,
        });
        const result = await generateFormulaTableCalculationFromContext(
            modelOptions,
            payload,
        );

        if (payload.mode === 'convert-sql') {
            this.analytics.track<ConvertSqlToFormulaGenerated>({
                userId: user.userUuid,
                event: 'ai.formula_table_calculation.converted_from_sql',
                properties: {
                    organizationId: user.organizationUuid!,
                    projectId: projectUuid,
                    userId: user.userUuid,
                },
            });
        } else {
            this.analytics.track<GenerateFormulaTableCalculationGenerated>({
                userId: user.userUuid,
                event: 'ai.formula_table_calculation.generated',
                properties: {
                    organizationId: user.organizationUuid!,
                    projectId: projectUuid,
                    userId: user.userUuid,
                },
            });
        }

        return {
            formula: result.formula,
            displayName: result.displayName,
            type: result.type as TableCalculationType,
            format: sanitizeFormulaCustomFormat(result.format ?? undefined),
        };
    }

    async generateTooltip(
        user: SessionUser,
        projectUuid: string,
        payload: GenerateTooltipRequest,
    ): Promise<GeneratedTooltip> {
        const project = await this.projectService.getProject(
            projectUuid,
            fromSession(user),
        );
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('Explore', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const modelOptions = await this.getAmbientAiModel(user, {
            projectUuid,
        });
        const result = await generateTooltipFromContext(modelOptions, {
            prompt: payload.prompt,
            fieldsContext: payload.fieldsContext,
            currentHtml: payload.currentHtml,
        });

        this.analytics.track<GenerateTooltipGenerated>({
            userId: user.userUuid,
            event: 'ai.tooltip.generated',
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                userId: user.userUuid,
            },
        });

        return {
            html: result.html,
        };
    }

    /**
     * Suggests preview data for a chart type being authored in Chart Studio:
     * one explore, one field per chart input, and other explores worth trying.
     * Metadata only — the runtime is used for explore search and definitions,
     * never to run a query.
     */
    async suggestChartTypeData(
        user: SessionUser,
        projectUuid: string,
        payload: SuggestChartTypeDataRequest,
    ): Promise<SuggestedChartTypeData> {
        const prompt = payload.prompt.trim();
        if (prompt.length === 0) {
            throw new ParameterError(
                'Describe the chart you want before asking for data.',
            );
        }
        const boundedPrompt = prompt.slice(0, CHART_TYPE_DATA_CAPS.promptChars);
        const hint = payload.hint?.trim()
            ? payload.hint.trim().slice(0, CHART_TYPE_DATA_CAPS.hintChars)
            : null;
        const requestedInputs =
            payload.inputs?.slice(0, CHART_TYPE_DATA_CAPS.requestInputs) ??
            null;

        const account = fromSession(user);
        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('Explore', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const modelOptions = await this.getAmbientAiModel(user, {
            projectUuid,
        });

        const runtime = this.getAiAgentToolsService().createRuntime({
            user,
            account,
            organizationUuid: project.organizationUuid,
            projectUuid,
            source: 'ai_agent',
            catalogSearchContext: CatalogSearchContext.AI_AGENT,
            defaultQueryExecutionContext: QueryExecutionContext.AI,
            tags: null,
            spaceAccess: null,
        });

        const searchQuery = [
            boundedPrompt,
            hint,
            ...(requestedInputs ?? []).map((input) => input.label),
        ]
            .filter((part): part is string => !!part)
            .join(' ')
            .slice(0, CHART_TYPE_DATA_CAPS.searchQueryChars);

        // Always searched: a pinned explore still needs its fields ranked, or
        // a wide table reaches the model as an alphabetical slice.
        const found = await runtime.findExplores({
            searchQuery,
            fieldSearchSize: CHART_TYPE_DATA_CAPS.fieldSearchSize,
        });
        const fieldRanking = buildFieldRanking(found.topMatchingFields ?? []);
        // The explore names the model may pick from, and the labels the
        // response is allowed to show, both come from this search only. A
        // pinned explore is the author's choice, so nothing else is offered.
        const searchResults: AlternativeExploreCandidate[] = payload.exploreName
            ? []
            : (found.exploreSearchResults ?? []).map((explore) => ({
                  name: explore.name,
                  label: explore.label,
                  description: explore.description ?? null,
              }));

        const candidateNames = payload.exploreName
            ? [payload.exploreName]
            : searchResults
                  .slice(0, CHART_TYPE_DATA_CAPS.candidateExplores)
                  .map((explore) => explore.name);

        if (candidateNames.length === 0) {
            return { kind: 'no_data', reason: NO_MATCHING_EXPLORE_REASON };
        }

        const explores = (
            await Promise.all(
                candidateNames.map((table) =>
                    runtime.getExplore({ table }).catch(() => null),
                ),
            )
        ).filter((explore): explore is Explore => explore !== null);

        if (explores.length === 0) {
            return { kind: 'no_data', reason: NO_ACCESSIBLE_EXPLORE_REASON };
        }

        const suggestion = await suggestChartTypeDataFromContext(modelOptions, {
            prompt: boundedPrompt,
            hint,
            inputs: requestedInputs,
            explores,
            alternativeExplores: searchResults
                .slice(CHART_TYPE_DATA_CAPS.candidateExplores)
                .slice(0, CHART_TYPE_DATA_CAPS.alternativeExplores),
            fieldRanking,
        });

        const chosen = explores.find(
            (explore) => explore.name === suggestion.exploreName,
        );
        if (!chosen) {
            return { kind: 'no_data', reason: NO_CHOSEN_EXPLORE_REASON };
        }

        const { inputs, fits } = validateChartTypeDataSuggestion({
            suggestion,
            explore: chosen,
            requestedInputs,
        });

        const alternativeLabels = new Map(
            searchResults.map((explore) => [explore.name, explore.label]),
        );
        const alternatives = suggestion.alternatives.reduce<
            ChartTypeDataAlternative[]
        >((acc, alternative) => {
            const label = alternativeLabels.get(alternative.exploreName);
            if (
                label === undefined ||
                alternative.exploreName === chosen.name ||
                acc.some(
                    (kept) => kept.exploreName === alternative.exploreName,
                ) ||
                acc.length >= CHART_TYPE_DATA_CAPS.alternatives
            ) {
                return acc;
            }
            return [
                ...acc,
                {
                    exploreName: alternative.exploreName,
                    exploreLabel: label,
                    summary: truncate(
                        alternative.summary,
                        CHART_TYPE_DATA_CAPS.alternativeSummaryChars,
                    ),
                },
            ];
        }, []);

        this.analytics.track<ChartTypeDataSuggested>({
            userId: user.userUuid,
            event: 'ai.chart_type_data.suggested',
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                userId: user.userUuid,
                candidateExploreCount: explores.length,
                inputCount: inputs.length,
                mappedInputCount: inputs.filter(
                    (input) => input.fieldId !== null,
                ).length,
                inputsInferred: requestedInputs === null,
                fits,
            },
        });

        return {
            kind: 'suggested',
            exploreName: chosen.name,
            exploreLabel: chosen.label,
            shapeSummary: truncate(
                suggestion.shapeSummary,
                CHART_TYPE_DATA_CAPS.shapeSummaryChars,
            ),
            inputs,
            alternatives,
            fits,
        };
    }

    /**
     * Single-shot anomaly detection over the query results behind a data app
     * view, on the ambient fast model. Content is already filtered to what the
     * viewer may see; the model never re-queries the warehouse.
     */
    async detectDataAppAnomalies(
        user: SessionUser,
        {
            content,
            instructions,
            projectUuid,
        }: {
            content: string;
            instructions: string | null;
            projectUuid: string;
        },
    ): Promise<{ detection: DataAppDetection; modelId: string | null }> {
        const modelOptions = await this.getAmbientAiModel(user, {
            projectUuid,
        });
        const detection = await detectDataAppAnomalies(modelOptions, {
            content,
            instructions,
            today: new Date().toISOString().slice(0, 10),
        });
        return {
            detection,
            modelId:
                getLanguageModelAttribution(modelOptions.model).model ?? null,
        };
    }

    async answerDataAppPrompt(
        user: SessionUser,
        {
            content,
            prompt,
            focus,
            projectUuid,
        }: {
            content: string;
            prompt: string;
            focus: Record<string, string> | null;
            projectUuid: string;
        },
    ): Promise<{ text: string; modelId: string | null }> {
        const modelOptions = await this.getAmbientAiModel(user, {
            projectUuid,
        });
        const text = await answerDataAppPrompt(modelOptions, {
            content,
            prompt,
            focus,
        });
        return {
            text,
            modelId:
                getLanguageModelAttribution(modelOptions.model).model ?? null,
        };
    }

    /**
     * Single-shot summary of a scheduled delivery's already-rendered content
     * using the ambient fast model. The content is the data the delivery sends
     * (filters and parameters already applied upstream), so the model never
     * re-queries the warehouse.
     */
    async generateDeliverySummary(
        user: SessionUser,
        {
            prompt,
            content,
            projectUuid,
        }: {
            prompt: string;
            content: string;
            projectUuid: string;
        },
    ): Promise<string> {
        const modelOptions = await this.getAmbientAiModel(user, {
            projectUuid,
        });

        const result = await generateText({
            model: modelOptions.model,
            ...modelOptions.callOptions,
            providerOptions: modelOptions.providerOptions,
            experimental_telemetry: getGeneratorTelemetry(
                modelOptions,
                'generateDeliverySummary',
                'delivery-summary',
            ),
            messages: [
                {
                    role: 'system',
                    content: `You write concise summaries of scheduled analytics deliveries.
Given the delivery's data and the user's instructions, return a short plain-text
report suitable for an email or Slack message. Only use the data provided —
never invent figures. Do not repeat the raw table.`,
                },
                {
                    role: 'user',
                    content: [
                        `Instructions:\n${prompt}`,
                        `Delivery data:\n${content}`,
                    ].join('\n\n'),
                },
            ],
        });

        return result.text.trim();
    }
}
