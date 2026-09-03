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
    SessionUser,
    TableCalculationType,
    UnexpectedServerError,
} from '@lightdash/common';
import { generateText } from 'ai';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { fromSession } from '../../../auth/account';
import { LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import {
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
import { generateCustomDimension as generateCustomDimensionFromContext } from '../ai/agents/customDimensionGenerator';
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
import { AiCallAttribution } from '../ai/utils/aiCallTelemetry';
import { DEFAULT_CUSTOM_VIZ_PROMPT } from './utils/prompts';
import { getTotalTokenUsage } from './utils/tokens';

type Dependencies = {
    analytics: LightdashAnalytics;
    projectService: ProjectService;
    openAi: OpenAi;
    lightdashConfig: LightdashConfig;
    featureFlagService: FeatureFlagService;
    orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;
};

export class AiService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectService: ProjectService;

    private readonly openAi: OpenAi;

    private readonly featureFlagService: FeatureFlagService;

    private readonly orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;

    constructor(dependencies: Dependencies) {
        super();
        this.analytics = dependencies.analytics;
        this.projectService = dependencies.projectService;
        this.openAi = dependencies.openAi;
        this.lightdashConfig = dependencies.lightdashConfig;
        this.featureFlagService = dependencies.featureFlagService;
        this.orgAiCopilotConfigResolver =
            dependencies.orgAiCopilotConfigResolver;
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
